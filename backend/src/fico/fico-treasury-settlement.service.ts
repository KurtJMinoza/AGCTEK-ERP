import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateFicoTreasurySettlementDto,
    ImportBankStatementDto,
} from './dto/fico-treasury.dto'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'

type Actor = AuthRequestUser | undefined

function day(value: Date | string) {
    const date = typeof value === 'string' ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('A valid posting date is required.')
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

function money(value: Decimal | Prisma.Decimal | number | string) {
    return new Decimal(value?.toString?.() ?? value)
}

@Injectable()
export class FicoTreasurySettlementService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly journal: FicoJournalService,
        private readonly paymentResolution: FicoTreasuryPaymentResolutionService,
        private readonly accountResolution: FicoAccountResolutionService,
    ) {}

    async listSettlements(companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoTreasurySettlement.findMany({
            where: { companyId },
            include: {
                fromTreasuryAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                toTreasuryAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                journalEntry: {
                    select: { id: true, documentNumber: true, postedAt: true },
                },
            },
            orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
            take: 200,
        })
    }

    async listBankStatement(companyId: string, treasuryAccountId: string | undefined, user: Actor) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoTreasuryBankStatementLine.findMany({
            where: {
                companyId,
                ...(treasuryAccountId ? { treasuryAccountId } : {}),
            },
            include: {
                treasuryAccount: { select: { accountCode: true, accountName: true } },
                journalEntry: { select: { documentNumber: true } },
            },
            orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        })
    }

    async importBankStatement(dto: ImportBankStatementDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        let imported = 0
        let skipped = 0
        for (const line of dto.lines) {
            const treasury = await this.prisma.ficoTreasuryAccount.findFirst({
                where: { id: line.treasuryAccountId, companyId: dto.companyId },
            })
            if (!treasury) {
                throw new BadRequestException(
                    `Treasury account ${line.treasuryAccountId} is not valid for this company.`,
                )
            }
            try {
                await this.prisma.ficoTreasuryBankStatementLine.create({
                    data: {
                        companyId: dto.companyId,
                        treasuryAccountId: line.treasuryAccountId,
                        statementDate: day(line.statementDate),
                        amount: money(line.amount),
                        direction: line.direction,
                        reference: line.reference ?? null,
                        externalId: line.externalId,
                    },
                })
                imported += 1
            } catch (err: unknown) {
                if (
                    err &&
                    typeof err === 'object' &&
                    'code' in err &&
                    (err as { code: string }).code === 'P2002'
                ) {
                    skipped += 1
                    continue
                }
                throw err
            }
        }
        return { imported, skipped }
    }

    async createSettlement(dto: CreateFicoTreasurySettlementDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        const postingDate = day(dto.postingDate)
        const valueDate = dto.valueDate ? day(dto.valueDate) : null
        const currencyCode = dto.currencyCode.trim().toUpperCase()
        const gross = money(dto.grossAmount)
        const fee = money(dto.feeAmount ?? 0)
        if (!gross.gt(0)) {
            throw new BadRequestException('Gross amount must be greater than zero.')
        }
        if (fee.gt(gross)) {
            throw new BadRequestException('Fee cannot exceed gross amount.')
        }
        const net = gross.minus(fee)
        const idempotencyKey =
            dto.idempotencyKey?.trim() ??
            `TREASURY_SETTLEMENT:${dto.companyId}:${dto.settlementType}:${dto.postingDate}:${gross}`

        const existing = await this.prisma.ficoTreasurySettlement.findUnique({
            where: { idempotencyKey },
            select: { id: true, journalEntryId: true, settlementNumber: true },
        })
        if (existing) {
            return { ...existing, duplicate: true, created: false }
        }

        const lines = await this.buildSettlementLines({
            dto,
            companyId: dto.companyId,
            postingDate,
            currencyCode,
            gross,
            fee,
            net,
        })

        const journalResult = await this.journal.postAutomaticJournal({
            companyId: dto.companyId,
            documentType: 'TREASURY_SETTLEMENT',
            documentDate: postingDate,
            postingDate,
            currencyCode,
            sourceModule: 'TREASURY',
            sourceDocumentType: dto.settlementType,
            sourceDocumentId: idempotencyKey,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Treasury ${dto.settlementType.replace(/_/g, ' ').toLowerCase()}`,
            reference: dto.reference ?? null,
            lines: lines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            metadata: {
                settlementType: dto.settlementType,
                paymentMethodCode: dto.paymentMethodCode ?? null,
                providerCode: dto.providerCode ?? null,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
            afterPersist: async (tx, journalEntry) => {
                await tx.ficoTreasurySettlement.create({
                    data: {
                        companyId: dto.companyId,
                        settlementNumber: `SET-${journalEntry.documentNumber ?? journalEntry.id}`,
                        settlementType: dto.settlementType,
                        status: 'POSTED',
                        journalEntryId: journalEntry.id,
                        fromTreasuryAccountId: dto.fromTreasuryAccountId ?? null,
                        toTreasuryAccountId: dto.toTreasuryAccountId ?? null,
                        grossAmount: gross,
                        feeAmount: fee,
                        netAmount: net,
                        currencyCode,
                        postingDate,
                        valueDate,
                        paymentMethodCode: dto.paymentMethodCode?.trim().toUpperCase() ?? null,
                        providerCode: dto.providerCode?.trim().toUpperCase() ?? null,
                        reference: dto.reference ?? null,
                        idempotencyKey,
                        createdBy: user?.id ?? null,
                    },
                })
            },
        })

        return {
            ...journalResult,
            settlementNumber: journalResult.documentNumber
                ? `SET-${journalResult.documentNumber}`
                : undefined,
        }
    }

    private async loadTreasuryGl(
        companyId: string,
        treasuryAccountId: string | undefined,
        role: string,
    ) {
        if (!treasuryAccountId) {
            throw new BadRequestException(`${role} treasury account is required.`)
        }
        const account = await this.prisma.ficoTreasuryAccount.findFirst({
            where: {
                id: treasuryAccountId,
                companyId,
                status: 'ACTIVE',
                postingBlocked: false,
            },
            select: { id: true, glAccountId: true, accountCode: true },
        })
        if (!account) {
            throw new NotFoundException(`${role} treasury account not found or blocked.`)
        }
        return account
    }

    private async resolveKeyAccount(input: {
        companyId: string
        postingDate: Date
        currencyCode: string
        transactionKey: string
        side: 'DEBIT' | 'CREDIT'
        paymentMethodCode?: string | null
    }) {
        const resolved = await this.accountResolution.resolveDetermination({
            companyId: input.companyId,
            sourceModule: 'TREASURY',
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
            transactionKey: input.transactionKey,
            dimensions: input.paymentMethodCode
                ? { paymentMethodCode: input.paymentMethodCode }
                : {},
        })
        const bucket =
            input.side === 'DEBIT'
                ? resolved.resolution.debitLines
                : resolved.resolution.creditLines
        return bucket[0]?.glAccountId ?? resolved.glAccountId
    }

    private async buildSettlementLines(input: {
        dto: CreateFicoTreasurySettlementDto
        companyId: string
        postingDate: Date
        currencyCode: string
        gross: Decimal
        fee: Decimal
        net: Decimal
    }) {
        const { dto, companyId, postingDate, currencyCode, gross, fee, net } = input
        const method = dto.paymentMethodCode?.trim().toUpperCase() ?? null

        const line = (
            glAccountId: string,
            debit: Decimal,
            credit: Decimal,
            description: string,
        ) => ({ glAccountId, debit, credit, description })

        switch (dto.settlementType) {
            case 'INTERNAL_TRANSFER': {
                const from = await this.loadTreasuryGl(
                    companyId,
                    dto.fromTreasuryAccountId,
                    'Source',
                )
                const to = await this.loadTreasuryGl(
                    companyId,
                    dto.toTreasuryAccountId,
                    'Destination',
                )
                return [
                    line(to.glAccountId, net, new Decimal(0), `Transfer to ${to.accountCode}`),
                    line(from.glAccountId, new Decimal(0), net, `Transfer from ${from.accountCode}`),
                ]
            }
            case 'CASH_DEPOSIT': {
                const from = await this.loadTreasuryGl(
                    companyId,
                    dto.fromTreasuryAccountId,
                    'Cash',
                )
                const to = await this.loadTreasuryGl(companyId, dto.toTreasuryAccountId, 'Bank')
                return [
                    line(to.glAccountId, gross, new Decimal(0), 'Cash deposit to bank'),
                    line(from.glAccountId, new Decimal(0), gross, 'Cash on hand reduction'),
                ]
            }
            case 'CASH_WITHDRAWAL': {
                const from = await this.loadTreasuryGl(
                    companyId,
                    dto.fromTreasuryAccountId,
                    'Bank',
                )
                const to = await this.loadTreasuryGl(companyId, dto.toTreasuryAccountId, 'Cash')
                return [
                    line(to.glAccountId, gross, new Decimal(0), 'Cash withdrawn'),
                    line(from.glAccountId, new Decimal(0), gross, 'Bank disbursement'),
                ]
            }
            case 'CARD_SETTLEMENT':
            case 'EWALLET_SETTLEMENT': {
                const clearing = await this.loadTreasuryGl(
                    companyId,
                    dto.fromTreasuryAccountId,
                    'Clearing',
                )
                const bank = await this.loadTreasuryGl(companyId, dto.toTreasuryAccountId, 'Bank')
                const rows = [
                    line(bank.glAccountId, net, new Decimal(0), 'Settlement to bank (net)'),
                    line(clearing.glAccountId, new Decimal(0), gross, 'Clear outstanding clearing'),
                ]
                if (fee.gt(0)) {
                    const feeAccount = await this.resolveKeyAccount({
                        companyId,
                        postingDate,
                        currencyCode,
                        transactionKey: 'BANK_CHARGES',
                        side: 'DEBIT',
                        paymentMethodCode: method,
                    })
                    rows.unshift(
                        line(feeAccount, fee, new Decimal(0), 'Merchant / provider fee'),
                    )
                }
                return rows
            }
            case 'INCOMING_PAYMENT': {
                const to = dto.toTreasuryAccountId
                    ? await this.loadTreasuryGl(companyId, dto.toTreasuryAccountId, 'Bank')
                    : null
                const debitAccount =
                    to?.glAccountId ??
                    (
                        await this.paymentResolution.resolvePaymentAccount({
                            companyId,
                            paymentMethodCode: method ?? 'BANK_TRANSFER',
                            currencyCode,
                            postingDate,
                            providerCode: dto.providerCode ?? null,
                            side: 'DEBIT',
                        })
                    ).glAccountId
                const creditAccount = await this.resolveKeyAccount({
                    companyId,
                    postingDate,
                    currencyCode,
                    transactionKey: 'PAYMENT_CLEARING',
                    side: 'CREDIT',
                    paymentMethodCode: method,
                })
                return [
                    line(debitAccount, gross, new Decimal(0), 'Incoming payment'),
                    line(creditAccount, new Decimal(0), gross, 'Clear payment clearing'),
                ]
            }
            case 'OUTGOING_PAYMENT': {
                const from = dto.fromTreasuryAccountId
                    ? await this.loadTreasuryGl(companyId, dto.fromTreasuryAccountId, 'Bank')
                    : null
                const creditAccount =
                    from?.glAccountId ??
                    (
                        await this.paymentResolution.resolvePaymentAccount({
                            companyId,
                            paymentMethodCode: method ?? 'BANK_TRANSFER',
                            currencyCode,
                            postingDate,
                            side: 'CREDIT',
                        })
                    ).glAccountId
                const debitAccount = await this.resolveKeyAccount({
                    companyId,
                    postingDate,
                    currencyCode,
                    transactionKey: 'PAYMENT_CLEARING',
                    side: 'DEBIT',
                    paymentMethodCode: method,
                })
                return [
                    line(debitAccount, gross, new Decimal(0), 'Outgoing payment clearing'),
                    line(creditAccount, new Decimal(0), gross, 'Bank disbursement'),
                ]
            }
            default:
                throw new BadRequestException(`Unsupported settlement type ${dto.settlementType}.`)
        }
    }
}