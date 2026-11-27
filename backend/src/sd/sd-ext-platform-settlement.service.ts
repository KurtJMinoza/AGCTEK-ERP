import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from '../fico/fico-account-resolution.service'
import { FicoAccountsReceivableService } from '../fico/fico-accounts-receivable.service'
import { FicoCompanyAccessService } from '../fico/fico-company-access.service'
import { FicoJournalService } from '../fico/fico-journal.service'
import type { RecordExtPlatformSettlementDto } from './dto/ext-platform-settlement.dto'

type Actor = AuthRequestUser | undefined

const MONEY_TOLERANCE = new Decimal('0.01')

function money(value: Decimal | number | string) {
    return new Decimal(value?.toString?.() ?? value)
}

function day(value: Date | string) {
    const date = typeof value === 'string' ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('A valid posting date is required.')
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

/**
 * Marketplace settlement (policy A): gross AR stays until payout; one journal
 * Dr Bank (net) · Dr marketplace fee · Cr AR (gross). Does not repost revenue/COGS.
 */
@Injectable()
export class SdExtPlatformSettlementService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly journal: FicoJournalService,
        private readonly accountResolution: FicoAccountResolutionService,
        private readonly ar: FicoAccountsReceivableService,
    ) {}

    async recordSettlement(
        transactionId: string,
        dto: RecordExtPlatformSettlementDto,
        user: Actor,
    ) {
        const tx = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id: transactionId },
            include: {
                salesSource: { select: { code: true, name: true } },
                ficoArDocument: { include: { openItem: true } },
            },
        })
        if (!tx) throw new NotFoundException('Transaction not found.')
        await this.access.assertAccess(user, tx.companyId)
        if (dto.companyId && dto.companyId !== tx.companyId) {
            throw new BadRequestException('Company mismatch.')
        }
        if (tx.status !== 'APPROVED') {
            throw new BadRequestException(
                'Only approved marketplace sales can be settled.',
            )
        }
        if (tx.settlementStatus === 'SETTLED') {
            throw new ConflictException('This transaction is already settled.')
        }
        if (!tx.ficoArDocument?.openItem) {
            throw new BadRequestException(
                'No marketplace receivable open item — post revenue / AR first.',
            )
        }

        const gross = money(tx.grandTotal)
        const fee = money(dto.actualPlatformFees ?? tx.platformFees ?? 0)
        const net = money(dto.actualPayout ?? gross.minus(fee))
        if (!gross.gt(0)) {
            throw new BadRequestException('Gross receivable must be greater than zero.')
        }
        if (fee.lt(0) || net.lt(0)) {
            throw new BadRequestException('Payout and fees cannot be negative.')
        }
        const sum = net.plus(fee)
        if (sum.minus(gross).abs().gt(MONEY_TOLERANCE)) {
            throw new BadRequestException(
                `Net payout (${net}) plus fees (${fee}) must equal gross receivable (${gross}).`,
            )
        }

        const openAmount = money(tx.ficoArDocument.openItem.openAmount)
        if (gross.minus(openAmount).abs().gt(MONEY_TOLERANCE)) {
            throw new BadRequestException(
                `Outstanding AR (${openAmount}) does not match gross receivable (${gross}).`,
            )
        }

        const postingDate = day(dto.postingDate ?? new Date())
        const currencyCode = (tx.currency ?? 'PHP').trim().toUpperCase()
        const channelCode = tx.salesSource.code.trim().toUpperCase()
        const idempotencyKey =
            dto.idempotencyKey?.trim() ??
            `ext-platform-settlement:${tx.id}`

        const existingJe = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey },
            select: { id: true, documentNumber: true },
        })
        if (existingJe) {
            return {
                created: false,
                duplicate: true,
                journalEntryId: existingJe.id,
                documentNumber: existingJe.documentNumber,
            }
        }

        const treasury = await this.prisma.ficoTreasuryAccount.findFirst({
            where: {
                id: dto.treasuryAccountId,
                companyId: tx.companyId,
                status: 'ACTIVE',
                postingBlocked: false,
            },
            select: { id: true, glAccountId: true, accountCode: true },
        })
        if (!treasury) {
            throw new BadRequestException('Bank / treasury account is invalid or blocked.')
        }

        const receivableGlId =
            tx.ficoArDocument.reconciliationAccountId ??
            tx.ficoArDocument.openItem.reconciliationAccountId
        if (!receivableGlId) {
            throw new BadRequestException('Receivable G/L account missing on AR document.')
        }

        const feeAccountId = await this.resolveFeeAccount({
            companyId: tx.companyId,
            postingDate,
            currencyCode,
            channelCode,
        })

        const flatLines = [
            {
                glAccountId: treasury.glAccountId,
                debit: net,
                credit: new Decimal(0),
                description: `Marketplace payout · ${tx.transactionNumber}`,
            },
            ...(fee.gt(0)
                ? [
                      {
                          glAccountId: feeAccountId,
                          debit: fee,
                          credit: new Decimal(0),
                          description: `Platform fees · ${channelCode} · ${tx.transactionNumber}`,
                      },
                  ]
                : []),
            {
                glAccountId: receivableGlId,
                debit: new Decimal(0),
                credit: gross,
                description: `Clear marketplace AR · ${tx.transactionNumber}`,
            },
        ]

        const journalResult = await this.journal.postAutomaticJournal({
            companyId: tx.companyId,
            documentType: 'SD_MARKETPLACE_SETTLEMENT',
            documentDate: postingDate,
            postingDate,
            currencyCode,
            sourceModule: 'SD',
            sourceDocumentType: 'EXT_PLATFORM_SETTLEMENT',
            sourceDocumentId: tx.id,
            customerId: tx.ficoArDocument.customerId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Marketplace settlement · ${tx.transactionNumber}`,
            reference: dto.settlementReference?.trim() || tx.settlementReference,
            lines: flatLines,
            metadata: {
                transactionNumber: tx.transactionNumber,
                salesSourceCode: channelCode,
                grossAmount: gross.toString(),
                feeAmount: fee.toString(),
                netPayout: net.toString(),
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
        })

        await this.ar.applyMarketplaceSettlementToOpenItem({
            companyId: tx.companyId,
            transactionId: tx.id,
            clearingJournalEntryId: journalResult.journalEntryId!,
            clearedAmount: gross.toString(),
        })

        await this.prisma.sdExtPlatformTransaction.update({
            where: { id: tx.id },
            data: {
                settlementStatus: 'SETTLED',
                actualPlatformFees: fee,
                actualPayout: net,
                settledAt: new Date(),
                settlementJournalEntryId: journalResult.journalEntryId ?? null,
                settlementReference:
                    dto.settlementReference?.trim() ||
                    tx.settlementReference ||
                    undefined,
            },
        })

        return {
            created: journalResult.created,
            duplicate: journalResult.duplicate,
            journalEntryId: journalResult.journalEntryId,
            documentNumber: journalResult.documentNumber,
            settlementStatus: 'SETTLED',
        }
    }

    private async resolveFeeAccount(input: {
        companyId: string
        postingDate: Date
        currencyCode: string
        channelCode: string
    }) {
        const resolved = await this.accountResolution.resolveDetermination({
            companyId: input.companyId,
            sourceModule: 'SD',
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
            transactionKey: 'BANK_CHARGES',
            dimensions: { salesChannelCode: input.channelCode },
        })
        const accountId =
            resolved.resolution.debitLines[0]?.glAccountId ?? resolved.glAccountId
        if (!accountId) {
            throw new BadRequestException(
                `No marketplace fee expense account for channel ${input.channelCode}. Configure BANK_CHARGES determination.`,
            )
        }
        return accountId
    }
}