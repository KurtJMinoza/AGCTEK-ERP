import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoFinancialPeriodService } from './financial-period.service'

export type CreateJournalResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
}

@Injectable()
export class FicoJournalService {
    private readonly logger = new Logger(FicoJournalService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly financialPeriods: FicoFinancialPeriodService,
        @Optional()
        private readonly accountDetermination?: FicoAccountDeterminationService,
    ) {}

    async createFromAccountingEvent(
        payload: MmAccountingDispatchPayload,
    ): Promise<CreateJournalResult> {
        const idempotencyKey =
            payload.idempotencyKey ??
            `${payload.eventType}:${payload.documentType}:${payload.documentId}`

        const totalAmount = new Decimal(payload.totalValue ?? 0).abs()
        const postingDate = new Date(payload.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid accounting posting date is required.')
        }

        const period = await this.financialPeriods.canPostToPeriod({
            companyId: payload.companyId,
            postingDate,
        })
        if (!period.allowed) {
            throw new BadRequestException(
                period.reason ?? 'Accounting posting is not allowed for this fiscal period.',
            )
        }

        try {
            const resolvedLines = this.accountDetermination
                ? await this.accountDetermination.resolveMmPosting(payload)
                : null
            if (resolvedLines) {
                return await this.createResolvedJournal({
                    payload,
                    idempotencyKey,
                    postingDate,
                    resolvedLines,
                })
            }
            const journal = await this.prisma.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    sourceEventId: payload.sourceEventId ?? null,
                    sourceTransactionId:
                        typeof payload.sourceTransactionId === 'string'
                            ? payload.sourceTransactionId
                            : null,
                    mmAccountingEventId: payload.mmAccountingEventId ?? null,
                    companyId: payload.companyId,
                    postingDate,
                    totalAmount,
                    currencyCode: payload.currencyCode ?? 'USD',
                    status: 'POSTED',
                    metadata: {
                        eventType: payload.eventType,
                        accountingEffects: payload.accountingEffects,
                        documentType: payload.documentType,
                        documentId: payload.documentId,
                        lines: payload.lines,
                    },
                },
            })

            if (payload.mmAccountingEventId) {
                await this.prisma.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        consumedAt: new Date(),
                        journalEntryId: journal.id,
                    },
                })
            }

            return { created: true, duplicate: false, journalEntryId: journal.id }
        } catch (err: unknown) {
            if (this.isUniqueConstraintError(err)) {
                this.logger.debug(`Duplicate journal skipped: ${idempotencyKey}`)
                const existing = await this.prisma.ficoJournalEntry.findUnique({
                    where: { idempotencyKey },
                })
                return {
                    created: false,
                    duplicate: true,
                    journalEntryId: existing?.id,
                }
            }
            if (payload.mmAccountingEventId) {
                await this.prisma.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'FAILED',
                        lastError: this.errorMessage(err).slice(0, 2000),
                    },
                })
            }
            throw err
        }
    }

    private async createResolvedJournal(input: {
        payload: MmAccountingDispatchPayload
        idempotencyKey: string
        postingDate: Date
        resolvedLines: NonNullable<
            Awaited<ReturnType<FicoAccountDeterminationService['resolveMmPosting']>>
        >
    }): Promise<CreateJournalResult> {
        const { payload, idempotencyKey, postingDate, resolvedLines } = input
        const totalAmount = resolvedLines.reduce(
            (total, line) => total.plus(line.amount),
            new Decimal(0),
        )
        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: payload.companyId,
                periodType: 'NORMAL',
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            select: { id: true, fiscalYear: true },
        })

        const journal = await this.prisma.$transaction(async (tx) => {
            // Hold a shared lock while the posting is written.  Closing takes an
            // exclusive lock on the same period, so a close cannot interleave
            // between validation and this journal commit.
            if (fiscalPeriod) {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const lockedPeriod = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (
                    !lockedPeriod ||
                    !['OPEN', 'RESTRICTED'].includes(lockedPeriod.status)
                ) {
                    throw new BadRequestException(
                        'Accounting posting is not allowed because the fiscal period changed while the journal was being prepared.',
                    )
                }
                const controls = await tx.ficoPostingPeriodControl.findMany({
                    where: {
                        companyId: payload.companyId,
                        fiscalPeriodId: fiscalPeriod.id,
                        accountTypeScope: 'ALL',
                    },
                    select: { status: true },
                })
                if (controls.some((control) => ['CLOSED', 'LOCKED'].includes(control.status))) {
                    throw new BadRequestException(
                        'Accounting posting is not allowed because the fiscal period control changed while the journal was being prepared.',
                    )
                }
            }
            const created = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    sourceEventId: payload.sourceEventId ?? null,
                    sourceTransactionId:
                        typeof payload.sourceTransactionId === 'string'
                            ? payload.sourceTransactionId
                            : null,
                    mmAccountingEventId: payload.mmAccountingEventId ?? null,
                    companyId: payload.companyId,
                    postingDate,
                    documentDate: postingDate,
                    fiscalYear: fiscalPeriod?.fiscalYear ?? null,
                    fiscalPeriodId: fiscalPeriod?.id ?? null,
                    totalAmount,
                    currencyCode: payload.currencyCode.trim().toUpperCase(),
                    status: 'DRAFT',
                    documentType: this.documentType(payload.eventType),
                    sourceModule: payload.sourceModule,
                    sourceDocumentType: payload.documentType,
                    sourceDocumentId: payload.documentId,
                    sourcePostingKey: idempotencyKey,
                    description: `Automatic ${payload.eventType} posting`,
                    metadata: {
                        eventType: payload.eventType,
                        accountingEffects: payload.accountingEffects,
                        correlationId: payload.correlationId ?? null,
                    },
                },
            })
            await tx.ficoJournalEntryLine.createMany({
                data: resolvedLines.flatMap((line, index) => [
                    {
                        journalEntryId: created.id,
                        lineNumber: index * 2 + 1,
                        glAccountId: line.debitAccountId,
                        companyId: payload.companyId,
                        debitAmount: line.amount,
                        creditAmount: new Decimal(0),
                        currency: payload.currencyCode.trim().toUpperCase(),
                        description: line.transactionKey,
                        materialId: line.materialId,
                        warehouseId: line.warehouseId ?? null,
                    },
                    {
                        journalEntryId: created.id,
                        lineNumber: index * 2 + 2,
                        glAccountId: line.creditAccountId,
                        companyId: payload.companyId,
                        debitAmount: new Decimal(0),
                        creditAmount: line.amount,
                        currency: payload.currencyCode.trim().toUpperCase(),
                        description: line.transactionKey,
                        materialId: line.materialId,
                        warehouseId: line.warehouseId ?? null,
                    },
                ]),
            })
            const posted = await tx.ficoJournalEntry.update({
                where: { id: created.id },
                data: { status: 'POSTED', postedAt: new Date() },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: payload.companyId,
                    action: 'JOURNAL_POST',
                    entityType: 'FicoJournalEntry',
                    entityId: posted.id,
                    newValues: {
                        documentType: this.documentType(payload.eventType),
                        sourceDocumentType: payload.documentType,
                        sourceDocumentId: payload.documentId,
                        totalAmount: totalAmount.toString(),
                    },
                    metadata: {
                        idempotencyKey,
                        sourceEventId: payload.sourceEventId ?? null,
                    },
                },
            })
            if (payload.mmAccountingEventId) {
                await tx.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        consumedAt: new Date(),
                        journalEntryId: posted.id,
                    },
                })
            }
            return posted
        })
        return { created: true, duplicate: false, journalEntryId: journal.id }
    }

    private documentType(eventType: string) {
        if (eventType === 'GoodsReceiptPosted') return 'MM_GR'
        if (eventType === 'GoodsIssuePosted') return 'MM_GI'
        return 'MM_ADJUSTMENT'
    }

    private isUniqueConstraintError(error: unknown): error is { code: string } {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: unknown }).code === 'P2002'
        )
    }

    private errorMessage(error: unknown) {
        return error instanceof Error ? error.message : String(error)
    }
}
