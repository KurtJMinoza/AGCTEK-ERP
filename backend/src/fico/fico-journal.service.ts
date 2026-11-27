import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import {
    CreateJournalEntryDto,
    ReverseJournalEntryDto,
    UpdateJournalEntryDto,
} from './dto/fico.dto'
import {
    assertCancellable,
    assertDraftPostingStatus,
    assertManualReversalAllowed,
    resolveReversalDocumentType,
    validateJournalLinesForSubmission,
} from './fico-journal-lifecycle'
import {
    buildJournalListWhere,
    journalListOrderBy,
} from './fico-journal-list.builder'
import type { JournalEntryListQueryDto } from './dto/fico.dto'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoFinancialPeriodService } from './financial-period.service'
import { FicoFinancialPostingEngine } from './fico-financial-posting.engine'
import { FicoSdPostingService } from './fico-sd-posting.service'
import type {
    FinancialPostingRequest,
    FinancialPostingResult,
} from './fico-financial-posting.types'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoApReconciliationGuardService } from './fico-ap-reconciliation-guard.service'
import {
    FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS,
    FICO_JOURNAL_APPROVAL_STATUSES,
    FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS,
    isFicoJournalApprovalStatus,
    isValidJournalApprovalTransition,
} from './fico.constants'

export type CreateJournalResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
}

export type ManualJournalEntry = {
    id: string
    documentNumber: string
    postingDate: Date
    fiscalYear: number | null
    fiscalPeriodId: string | null
    totalAmount: Decimal
    currencyCode: string
    status: string
    approvalStatus: string
    description: string | null
    postedAt: Date | null
    lines: {
        id: string
        lineNumber: number
        glAccountId: string
        companyId: string
        debitAmount: Decimal
        creditAmount: Decimal
        currency: string
        description: string | null
    }[]
}

export type JournalSupplierSummary = {
    id: string
    supplierCode: string
    supplierName: string
}

export type JournalEntryListItem = {
    id: string
    documentNumber: string | null
    documentType: string
    documentDate: Date | null
    postingDate: Date
    fiscalYear: number | null
    status: string
    approvalStatus: string
    totalAmount: Decimal
    currencyCode: string
    description: string | null
    sourceModule: string | null
    sourceDocumentType: string | null
    sourceDocumentId: string | null
    supplierId: string | null
    supplier: JournalSupplierSummary | null
    createdBy: string | null
    postedBy: string | null
    postedAt: Date | null
    postedByName?: string | null
    postedByEmployeeCode?: string | null
    createdAt: Date
    lines: { id: string; lineNumber: number }[]
    fiscalPeriod: {
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
}

export type JournalEntryDetail = {
    id: string
    companyId: string
    documentNumber: string | null
    postingDate: Date
    documentDate: Date | null
    fiscalYear: number | null
    fiscalPeriodId: string | null
    totalAmount: Decimal
    currencyCode: string
    status: string
    approvalStatus: string
    description: string | null
    documentType: string
    supplierId: string | null
    supplier: JournalSupplierSummary | null
    postedAt: Date | null
    postedBy: string | null
    postedByName?: string | null
    postedByEmployeeCode?: string | null
    createdAt: Date
    fiscalPeriod: {
        id: string
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
    lines: {
        id: string
        lineNumber: number
        glAccountId: string
        companyId: string
        debitAmount: Decimal
        creditAmount: Decimal
        currency: string
        description: string | null
        glAccount: {
            id: string
            accountCode: string
            accountName: string
            accountType: string
        }
    }[]
}

const JOURNAL_SUPPLIER_SELECT = {
    id: true,
    supplierCode: true,
    supplierName: true,
} as const

export type JournalReversalResult = {
    originalId: string
    originalStatus: string
    reversalId: string
    reversalDocumentNumber: string | null
    reversalPostedAt: Date | null
}

type JournalReversalOptions = {
    operationalSourceReversal?: boolean
    /** Required when AP reverses its source document and restores subledger state atomically. */
    apSubledgerReversal?: boolean
    /** Required when AR reverses its source document and restores open-item state atomically. */
    arSubledgerReversal?: boolean
    afterReverse?: (
        tx: Prisma.TransactionClient,
        input: {
            original: { id: string; documentNumber: string | null }
            reversal: { id: string; documentNumber: string | null; postedAt: Date | null }
        },
    ) => Promise<void>
}

@Injectable()
export class FicoJournalService {
    private readonly logger = new Logger(FicoJournalService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly financialPeriods: FicoFinancialPeriodService,
        private readonly validation: FicoPostingValidationService,
        private readonly postingEngine: FicoFinancialPostingEngine,
        @Optional()
        private readonly accountDetermination?: FicoAccountDeterminationService,
        @Optional()
        private readonly sdPosting?: FicoSdPostingService,
        @Optional()
        private readonly apReconciliationGuard?: FicoApReconciliationGuardService,
    ) {}

    /**
     * Validates optional supplier partner for company-scoped journals.
     * Returns normalized id or null when cleared/omitted.
     */
    private async assertSupplierForCompany(
        companyId: string,
        supplierId: string | null | undefined,
    ): Promise<string | null> {
        if (supplierId == null) return null
        const trimmed = supplierId.trim()
        if (!trimmed) return null
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: { id: trimmed, deletedAt: null },
            select: { id: true, companyId: true, status: true },
        })
        if (!supplier) {
            throw new BadRequestException('Supplier not found.')
        }
        if (supplier.companyId !== companyId) {
            throw new BadRequestException(
                'Supplier belongs to a different company than this journal.',
            )
        }
        return supplier.id
    }

    async createFromAccountingEvent(
        payload: MmAccountingDispatchPayload,
    ): Promise<CreateJournalResult> {
        const idempotencyKey =
            payload.idempotencyKey ??
            `${payload.eventType}:${payload.documentType}:${payload.documentId}`

        const postingDate = new Date(payload.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid accounting posting date is required.')
        }

        if (payload.financiallyRelevant === false) {
            return { created: false, duplicate: false }
        }

        if (payload.eventType === 'PosSaleVoided' && payload.reversalOfJournalId) {
            const reversal = await this.reverseEntry(
                payload.reversalOfJournalId,
                {
                    companyId: payload.companyId,
                    reason:
                        payload.reversalReason?.trim() ||
                        'POS sale void reversal',
                    postingDate: payload.postingDate,
                },
                { id: 'SD_POS_VOID', name: 'POS void' },
                { operationalSourceReversal: true },
            )
            if (payload.mmAccountingEventId) {
                await this.prisma.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        journalEntryId: reversal.reversalId,
                        consumedAt: new Date(),
                        processingStartedAt: null,
                    },
                })
            }
            return {
                created: true,
                duplicate: Boolean(reversal.reversalPostedAt),
                journalEntryId: reversal.reversalId,
            }
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
            if (this.sdPosting?.isSdAccountingPayload(payload)) {
                const flatLines = await this.sdPosting.resolveFlatLines(payload)
                return await this.createAutomaticFromFlatLines({
                    payload,
                    idempotencyKey,
                    postingDate,
                    flatLines,
                })
            }
            if (!this.accountDetermination) {
                throw new BadRequestException(
                    'Automatic account determination is not configured for journal posting.',
                )
            }
            const resolvedLines =
                await this.accountDetermination.resolveMmPosting(payload)
            if (!resolvedLines?.length) {
                throw new BadRequestException(
                    'Automatic accounting could not resolve any debit/credit lines for this event.',
                )
            }
            return await this.createResolvedJournal({
                payload,
                idempotencyKey,
                postingDate,
                resolvedLines,
            })
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
            throw err
        }
    }

    async postAutomaticJournal(
        request: FinancialPostingRequest,
    ): Promise<FinancialPostingResult> {
        const existing = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: request.idempotencyKey },
            select: { id: true, documentNumber: true, postedAt: true },
        })
        if (existing) {
            return {
                journalEntryId: existing.id,
                documentNumber: existing.documentNumber ?? '',
                postedAt: existing.postedAt,
                duplicate: true,
                created: false,
            }
        }

        await this.apReconciliationGuard?.assertPostingAllowed({
            glAccountIds: request.lines.map((line) => line.glAccountId),
            subledgerPosting: request.subledgerPosting,
        })

        await this.validation.validate({
            companyId: request.companyId,
            postingDate: request.postingDate,
            source: 'AUTOMATIC',
            currencyCode: request.currencyCode,
            lines: request.lines.map((line) => ({
                glAccountId: line.glAccountId,
                debitAmount: Number(line.debit.toString()),
                creditAmount: Number(line.credit.toString()),
                currency: request.currencyCode,
            })),
        })

        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: request.companyId,
                periodType: 'NORMAL',
                startDate: { lte: request.postingDate },
                endDate: { gte: request.postingDate },
            },
            select: { id: true, fiscalYear: true, status: true },
        })
        if (
            !fiscalPeriod ||
            !['OPEN', 'RESTRICTED'].includes(fiscalPeriod.status)
        ) {
            throw new BadRequestException(
                'No open financial period covers the posting date.',
            )
        }

        const journal = await this.prisma.$transaction(async (tx) => {
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

            const documentNumber = await this.postingEngine.allocateDocumentNumber(
                tx,
                request.companyId,
                request.documentType,
                fiscalPeriod.fiscalYear,
            )

            const postedRequest: FinancialPostingRequest = {
                ...request,
                postImmediately: true,
            }
            const created = await this.postingEngine.persistJournalInTransaction(
                tx,
                postedRequest,
                fiscalPeriod,
                documentNumber,
            )

            await request.afterPersist?.(tx, created)

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: request.companyId,
                    action: 'JOURNAL_POST',
                    entityType: 'FicoJournalEntry',
                    entityId: created.id,
                    newValues: {
                        documentNumber,
                        documentType: request.documentType,
                        sourceModule: request.sourceModule,
                        sourceDocumentId: request.sourceDocumentId ?? null,
                    },
                    metadata: {
                        idempotencyKey: request.idempotencyKey,
                        postingSource: request.postingSource,
                    },
                },
            })

            if (request.mmAccountingEventId) {
                await tx.mmAccountingEvent.update({
                    where: { id: request.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        consumedAt: new Date(),
                        journalEntryId: created.id,
                    },
                })
            }

            return created
        })

        return {
            journalEntryId: journal.id,
            documentNumber: journal.documentNumber ?? '',
            postedAt: journal.postedAt,
            duplicate: false,
            created: true,
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
        const currency = payload.currencyCode.trim().toUpperCase()
        const flatLines = resolvedLines.map((line) => ({
            glAccountId: line.glAccountId,
            debit: line.debitAmount,
            credit: line.creditAmount,
            description: line.description,
            materialId: line.materialId,
            warehouseId: line.warehouseId ?? null,
        }))
        const result = await this.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: this.documentType(payload.eventType),
            documentDate: postingDate,
            postingDate,
            currencyCode: currency,
            sourceModule: payload.sourceModule,
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            sourceEventId: payload.sourceEventId ?? null,
            sourceTransactionId:
                typeof payload.sourceTransactionId === 'string'
                    ? payload.sourceTransactionId
                    : null,
            mmAccountingEventId: payload.mmAccountingEventId ?? null,
            supplierId:
                typeof payload.supplierId === 'string' && payload.supplierId.trim()
                    ? payload.supplierId.trim()
                    : null,
            idempotencyKey,
            description: `Automatic ${payload.eventType} posting`,
            lines: flatLines,
            metadata: {
                eventType: payload.eventType,
                accountingEffects: payload.accountingEffects,
                correlationId: payload.correlationId ?? null,
                returnRequestId: (() => {
                    const extra = payload as MmAccountingDispatchPayload & {
                        sdReturnRequestRef?: unknown
                        returnRequestId?: unknown
                    }
                    if (typeof extra.sdReturnRequestRef === 'string') {
                        return extra.sdReturnRequestRef
                    }
                    if (typeof extra.returnRequestId === 'string') {
                        return extra.returnRequestId
                    }
                    return null
                })(),
                resolutionSources: [
                    ...new Set(
                        resolvedLines.map((line) => line.resolutionSource),
                    ),
                ],
                determinationRuleIds: [
                    ...new Set(
                        resolvedLines
                            .map((line) => line.accountDeterminationRuleId)
                            .filter(Boolean),
                    ),
                ],
            },
            sourcePostingKey: idempotencyKey,
            postImmediately: true,
            postingSource: 'AUTOMATIC',
        })
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
    }

    private async createAutomaticFromFlatLines(input: {
        payload: MmAccountingDispatchPayload
        idempotencyKey: string
        postingDate: Date
        flatLines: Array<{
            glAccountId: string
            debit: Decimal
            credit: Decimal
            description: string
        }>
    }): Promise<CreateJournalResult> {
        const { payload, idempotencyKey, postingDate, flatLines } = input
        const currency = payload.currencyCode.trim().toUpperCase()
        const docType =
            payload.eventType === 'PosCollectionCompleted'
                ? 'SD_COLLECTION'
                : payload.eventType === 'SdSalesReturnRefundPaid'
                  ? 'SD_REVERSAL'
                  : 'SD_REVENUE'
        const result = await this.postAutomaticJournal({
            companyId: payload.companyId,
            documentType: docType,
            documentDate: postingDate,
            postingDate,
            currencyCode: currency,
            sourceModule: payload.sourceModule,
            sourceDocumentType: payload.documentType,
            sourceDocumentId: payload.documentId,
            sourceEventId: payload.sourceEventId ?? null,
            sourceTransactionId:
                typeof payload.sourceTransactionId === 'string'
                    ? payload.sourceTransactionId
                    : null,
            mmAccountingEventId: payload.mmAccountingEventId ?? null,
            supplierId:
                typeof payload.supplierId === 'string' && payload.supplierId.trim()
                    ? payload.supplierId.trim()
                    : null,
            idempotencyKey,
            description: `Automatic ${payload.eventType} posting`,
            lines: flatLines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
            })),
            metadata: this.automaticJournalMetadata(payload),
            sourcePostingKey: idempotencyKey,
            postImmediately: true,
            postingSource: 'AUTOMATIC',
        })
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
    }

    private automaticJournalMetadata(
        payload: MmAccountingDispatchPayload & {
            cashierUserId?: string
            orderNumber?: string
            salesOrderId?: string
            returnRequestId?: string
            refundId?: string
            sdReturnRequestRef?: string | null
        },
    ) {
        return {
            eventType: payload.eventType,
            accountingEffects: payload.accountingEffects,
            correlationId: payload.correlationId ?? null,
            salesOrderId: payload.salesOrderId ?? payload.documentId ?? null,
            orderNumber: payload.orderNumber ?? null,
            cashierUserId: payload.cashierUserId ?? null,
            returnRequestId:
                payload.returnRequestId ??
                (payload.documentType === 'RETURN_REQUEST'
                    ? payload.documentId
                    : null) ??
                payload.sdReturnRequestRef ??
                null,
            refundId: payload.refundId ?? null,
        }
    }

    // -----------------------------------------------------------------------
    // Manual journal entry creation (frontend posting UI)
    // -----------------------------------------------------------------------


    async createEntry(
        dto: CreateJournalEntryDto,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const postingDate = new Date(dto.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid posting date is required.')
        }

        if (!dto.lines || dto.lines.length < 2) {
            throw new BadRequestException(
                'At least two journal lines are required.',
            )
        }

        // Validate that debits equal credits.
        const totalDebit = dto.lines.reduce(
            (sum, line) => sum + (Number(line.debitAmount) || 0),
            0,
        )
        const totalCredit = dto.lines.reduce(
            (sum, line) => sum + (Number(line.creditAmount) || 0),
            0,
        )
        if (Math.abs(totalDebit - totalCredit) > 0.0001) {
            throw new BadRequestException(
                'Journal entry is unbalanced: total debits must equal total credits.',
            )
        }

        // No line may carry both a debit and a credit, and zero-value lines are not allowed.
        for (const line of dto.lines) {
            const debit = Number(line.debitAmount) || 0
            const credit = Number(line.creditAmount) || 0
            if (debit < 0 || credit < 0) {
                throw new BadRequestException(
                    'Negative debit or credit amounts are not allowed.',
                )
            }
            if (debit > 0 && credit > 0) {
                throw new BadRequestException(
                    'A journal line cannot have both debit and credit amounts.',
                )
            }
            if (debit === 0 && credit === 0) {
                throw new BadRequestException(
                    'Zero-value journal lines are not allowed.',
                )
            }
        }

        const currencyCode =
            (dto.currencyCode ?? 'PHP').toUpperCase().trim()

        await this.apReconciliationGuard?.assertPostingAllowed({
            glAccountIds: dto.lines.map((line) => line.glAccountId),
        })

        // Validate every account is active, postable, and assigned to the company.
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique(
            {
                where: { companyId: dto.companyId },
                select: { id: true, status: true, chartOfAccountsId: true },
            },
        )
        if (!settings) {
            throw new BadRequestException(
                'Accounting is not configured for this company. Configure and activate company accounting settings first.',
            )
        }
        if (settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Accounting postings are blocked because the company accounting configuration is ${settings.status}. Activate it before posting.`,
            )
        }
        for (const line of dto.lines) {
            await this.validation.assertAccountPostable(
                dto.companyId,
                line.glAccountId,
                'MANUAL',
                currencyCode,
                settings.chartOfAccountsId ?? undefined,
                postingDate,
            )
        }

        // Find the current fiscal period for this posting date.
        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: dto.companyId,
                periodType: 'NORMAL',
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            select: { id: true, fiscalYear: true, status: true },
        })

        if (!fiscalPeriod) {
            throw new BadRequestException(
                'No open financial period covers the posting date. Generate fiscal periods for this fiscal year first.',
            )
        }

        if (fiscalPeriod.status !== 'OPEN' && fiscalPeriod.status !== 'RESTRICTED') {
            throw new BadRequestException(
                `The financial period for ${postingDate.toISOString().slice(0, 10)} is ${fiscalPeriod.status.toLowerCase()}. Open or restrict the period before posting.`,
            )
        }

        const requiresApproval = false
        const canPostImmediately = false
        const supplierId = await this.assertSupplierForCompany(
            dto.companyId,
            dto.supplierId,
        )

        const idempotencyKey = `MANUAL:${dto.companyId}:${postingDate.toISOString().slice(0, 10)}:${Date.now()}`

        const created = await this.prisma.$transaction(async (tx) => {
            // Lock the period row to prevent a close/restrict interleaving between
            // validation and this commit.
            if (fiscalPeriod) {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const locked = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (
                    !locked ||
                    !['OPEN', 'RESTRICTED'].includes(locked.status)
                ) {
                    throw new BadRequestException(
                        'The fiscal period changed while the journal was being prepared. Please retry.',
                    )
                }
            }

            const documentNumber = await this.postingEngine.allocateDocumentNumber(
                tx,
                dto.companyId,
                'JOURNAL',
                fiscalPeriod.fiscalYear,
            )

            const now = new Date()
            const isDraft = !canPostImmediately

            const journal = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    companyId: dto.companyId,
                    postingDate,
                    documentDate: postingDate,
                    fiscalYear: fiscalPeriod.fiscalYear,
                    fiscalPeriodId: fiscalPeriod.id,
                    totalAmount: new Decimal(totalDebit),
                    currencyCode,
                    status: canPostImmediately ? 'POSTED' : 'DRAFT',
                    approvalStatus: canPostImmediately
                        ? FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS
                        : FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS,
                    requiresApproval: false,
                    documentType: 'JOURNAL',
                    documentNumber,
                    description: dto.description ?? null,
                    supplierId,
                    postedAt: canPostImmediately ? now : null,
                    postedBy: canPostImmediately ? user.id ?? null : null,
                    preparedBy: isDraft ? user.id ?? null : null,
                    preparedAt: isDraft ? now : null,
                    createdBy: user.id ?? null,
                    lines: {
                        create: dto.lines.map((line, index) => ({
                            lineNumber: index + 1,
                            glAccountId: line.glAccountId,
                            companyId: dto.companyId,
                            debitAmount: new Decimal(
                                Number(line.debitAmount) || 0,
                            ),
                            creditAmount: new Decimal(
                                Number(line.creditAmount) || 0,
                            ),
                            currency: currencyCode,
                            description: line.description ?? null,
                        })),
                    },
                },
                include: {
                    lines: true,
                },
            })

            if (canPostImmediately) {
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: dto.companyId,
                        action: 'JOURNAL_POST',
                        entityType: 'FicoJournalEntry',
                        entityId: journal.id,
                        newValues: {
                            documentNumber,
                            documentType: 'JOURNAL',
                            postingDate: postingDate.toISOString().slice(0, 10),
                            totalAmount: totalDebit.toString(),
                            currencyCode,
                            lineCount: dto.lines.length,
                            postedBy: user.id ?? null,
                        },
                        metadata: {
                            idempotencyKey,
                            source: 'MANUAL',
                        },
                    },
                })
            }

            return journal
        })

        return {
            id: created.id,
            documentNumber: created.documentNumber ?? '',
            postingDate: created.postingDate,
            fiscalYear: created.fiscalYear,
            fiscalPeriodId: created.fiscalPeriodId,
            totalAmount: created.totalAmount,
            currencyCode: created.currencyCode,
            status: created.status,
            approvalStatus: created.approvalStatus,
            description: created.description,
            postedAt: created.postedAt,
            lines: created.lines,
        }
    }

    async updateDraft(
        id: string,
        dto: UpdateJournalEntryDto,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (journal.companyId !== dto.companyId) {
            throw new BadRequestException('Company scope mismatch.')
        }
        assertDraftPostingStatus(journal.status)
        if (journal.approvalStatus === 'PENDING_APPROVAL') {
            throw new BadRequestException(
                'Withdraw the document from approval before editing.',
            )
        }
        if (journal.approvalStatus === 'NOT_REQUIRED') {
            throw new BadRequestException(
                'System-posted journals cannot be edited.',
            )
        }

        const postingDate = dto.postingDate
            ? new Date(dto.postingDate)
            : journal.postingDate
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid posting date is required.')
        }

        const lines = dto.lines ?? []
        validateJournalLinesForSubmission(lines)

        await this.apReconciliationGuard?.assertPostingAllowed({
            glAccountIds: lines.map((line) => line.glAccountId),
        })

        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique(
            {
                where: { companyId: dto.companyId },
                select: { id: true, status: true, chartOfAccountsId: true },
            },
        )
        if (!settings || settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Accounting is not active for this company.',
            )
        }
        const currencyCode = (
            dto.currencyCode ?? journal.currencyCode
        ).toUpperCase()
        for (const line of lines) {
            await this.validation.assertAccountPostable(
                dto.companyId,
                line.glAccountId,
                'MANUAL',
                currencyCode,
                settings.chartOfAccountsId ?? undefined,
                postingDate,
            )
        }

        const invalidatesApproval =
            journal.approvalStatus === 'APPROVED' ||
            journal.approvalStatus === 'REJECTED'
        const totalDebit = lines.reduce(
            (sum, line) => sum + (Number(line.debitAmount) || 0),
            0,
        )
        const supplierId =
            dto.supplierId === undefined
                ? journal.supplierId
                : await this.assertSupplierForCompany(
                      dto.companyId,
                      dto.supplierId,
                  )

        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.ficoJournalEntryLine.deleteMany({
                where: { journalEntryId: id },
            })
            const row = await tx.ficoJournalEntry.update({
                where: { id },
                data: {
                    postingDate,
                    documentDate: postingDate,
                    description: dto.description ?? journal.description,
                    currencyCode,
                    supplierId,
                    totalAmount: new Decimal(totalDebit),
                    approvalStatus: invalidatesApproval
                        ? 'DRAFT'
                        : journal.approvalStatus,
                    revisionNumber: invalidatesApproval
                        ? { increment: 1 }
                        : undefined,
                    approvedBy: invalidatesApproval ? null : undefined,
                    approvedAt: invalidatesApproval ? null : undefined,
                    reviewedBy: invalidatesApproval ? null : undefined,
                    reviewedAt: invalidatesApproval ? null : undefined,
                    rejectionReason: invalidatesApproval ? null : undefined,
                    rejectedAt: invalidatesApproval ? null : undefined,
                    lines: {
                        create: lines.map((line, index) => ({
                            lineNumber: index + 1,
                            glAccountId: line.glAccountId,
                            companyId: dto.companyId,
                            debitAmount: new Decimal(
                                Number(line.debitAmount) || 0,
                            ),
                            creditAmount: new Decimal(
                                Number(line.creditAmount) || 0,
                            ),
                            currency: currencyCode,
                            description: line.description ?? null,
                        })),
                    },
                },
                include: { lines: true },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: dto.companyId,
                    action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.UPDATE_DRAFT,
                    entityType: 'FicoJournalEntry',
                    entityId: id,
                    previousValues: {
                        approvalStatus: journal.approvalStatus,
                        revisionNumber: journal.revisionNumber,
                    },
                    newValues: {
                        approvalStatus: row.approvalStatus,
                        revisionNumber: row.revisionNumber,
                    },
                    metadata: {
                        editedBy: user.id ?? null,
                        approvalInvalidated: invalidatesApproval,
                    },
                },
            })
            return row
        })

        return this.toManualJournalEntry(updated)
    }

    async cancelDraft(
        id: string,
        companyId: string,
        user: { id?: string; name?: string | null },
        reason?: string,
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!journal || journal.companyId !== companyId) {
            throw new NotFoundException('Journal entry not found.')
        }
        assertCancellable(journal.status)
        if (journal.approvalStatus === 'PENDING_APPROVAL') {
            throw new BadRequestException(
                'Withdraw the document from approval before cancelling.',
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledBy: user.id ?? null,
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.CANCEL,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { status: journal.status },
                newValues: { status: 'CANCELLED', reason: reason ?? null },
                metadata: { cancelledBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    async withdrawSubmission(
        id: string,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        assertDraftPostingStatus(journal.status)
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'DRAFT')) {
            throw new BadRequestException(
                `Cannot withdraw a journal in ${journal.approvalStatus} status.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: { approvalStatus: 'DRAFT' },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.WITHDRAW,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: { approvalStatus: 'DRAFT' },
                metadata: { withdrawnBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    async getApprovalHistory(id: string) {
        return this.prisma.ficoAccountingAuditLog.findMany({
            where: {
                entityType: 'FicoJournalEntry',
                entityId: id,
            },
            orderBy: { createdAt: 'asc' },
        })
    }

    /** Submit a draft journal entry for approval (DRAFT → PENDING_APPROVAL). */
    async submitForApproval(
        id: string,
        user: { id?: string; name?: string | null },
        reason?: string,
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                status: true,
                approvalStatus: true,
                requiresApproval: true,
                revisionNumber: true,
                lines: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        assertDraftPostingStatus(journal.status)
        if (!isFicoJournalApprovalStatus(journal.approvalStatus)) {
            throw new BadRequestException(
                'Journal entry has an invalid approval status.',
            )
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'PENDING_APPROVAL')) {
            throw new BadRequestException(
                `Cannot submit a journal entry in ${journal.approvalStatus} status for approval.`,
            )
        }
        validateJournalLinesForSubmission(journal.lines)

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'PENDING_APPROVAL',
                preparedBy: user.id ?? null,
                preparedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.SUBMIT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: {
                    approvalStatus: 'PENDING_APPROVAL',
                    reason: reason ?? null,
                    revisionNumber: journal.revisionNumber,
                },
                metadata: { source: 'MANUAL', submittedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Approve a pending journal entry (PENDING_APPROVAL → APPROVED). */
    async approve(
        id: string,
        user: { id?: string; name?: string | null },
        reason?: string,
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'APPROVED')) {
            throw new BadRequestException(
                `Cannot approve a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const now = new Date()
        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'APPROVED',
                reviewedBy: user.id ?? null,
                reviewedAt: now,
                approvedBy: user.id ?? null,
                approvedAt: now,
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.APPROVE,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: {
                    approvalStatus: 'APPROVED',
                    approvedBy: user.id ?? null,
                    reason: reason ?? null,
                },
                metadata: { source: 'MANUAL', approvedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Reject a pending journal entry (PENDING_APPROVAL → REJECTED). */
    async reject(
        id: string,
        user: { id?: string; name?: string | null },
        reason: string,
    ): Promise<ManualJournalEntry> {
        if (!reason || reason.trim().length < 3) {
            throw new BadRequestException(
                'A rejection reason of at least 3 characters is required.',
            )
        }

        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'REJECTED')) {
            throw new BadRequestException(
                `Cannot reject a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'REJECTED',
                reviewedBy: user.id ?? null,
                reviewedAt: new Date(),
                rejectionReason: reason.trim(),
                rejectedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.REJECT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: {
                    approvalStatus: 'REJECTED',
                    rejectionReason: reason.trim(),
                    rejectedBy: user.id ?? null,
                },
                metadata: { source: 'MANUAL', rejectedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Resubmit a rejected journal entry (REJECTED → PENDING_APPROVAL). */
    async resubmit(
        id: string,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'PENDING_APPROVAL')) {
            throw new BadRequestException(
                `Cannot resubmit a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'PENDING_APPROVAL',
                rejectionReason: null,
                rejectedAt: null,
                preparedBy: user.id ?? null,
                preparedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.RESUBMIT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: { approvalStatus: 'PENDING_APPROVAL' },
                metadata: { source: 'MANUAL', resubmittedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Post a draft manual journal to the GL (approval workflow disabled). */
    async postApproved(
        id: string,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (journal.status === 'POSTED') {
            throw new BadRequestException('This journal entry has already been posted.')
        }
        if (journal.status !== 'DRAFT') {
            throw new BadRequestException(
                `Only draft journals can be posted (current status: ${journal.status}).`,
            )
        }
        if (journal.approvalStatus === 'PENDING_APPROVAL') {
            throw new BadRequestException(
                'This journal is stuck in legacy approval state. Withdraw or cancel it before posting.',
            )
        }
        const postableApproval = new Set([
            'DRAFT',
            'APPROVED',
            'NOT_REQUIRED',
            'REJECTED',
        ])
        if (!postableApproval.has(journal.approvalStatus)) {
            throw new BadRequestException(
                `Cannot post a journal entry in ${journal.approvalStatus} status.`,
            )
        }
        validateJournalLinesForSubmission(journal.lines)

        await this.validation.validate({
            companyId: journal.companyId,
            postingDate: journal.postingDate,
            source: journal.sourceModule ? 'AUTOMATIC' : 'MANUAL',
            currencyCode: journal.currencyCode,
            lines: journal.lines.map((line) => ({
                glAccountId: line.glAccountId,
                debitAmount: Number(line.debitAmount) || 0,
                creditAmount: Number(line.creditAmount) || 0,
                currency: line.currency,
            })),
        })

        const now = new Date()
        const updated = await this.prisma.$transaction(async (tx) => {
            const posted = await tx.ficoJournalEntry.update({
                where: { id },
                data: {
                    status: 'POSTED',
                    approvalStatus: FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS,
                    requiresApproval: false,
                    postedAt: now,
                    postedBy: user.id ?? null,
                },
                include: { lines: true },
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: journal.companyId,
                    action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.POST,
                    entityType: 'FicoJournalEntry',
                    entityId: id,
                    previousValues: {
                        approvalStatus: journal.approvalStatus,
                        status: journal.status,
                    },
                    newValues: {
                        approvalStatus: FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS,
                        status: 'POSTED',
                        documentNumber: journal.documentNumber,
                        postingDate: journal.postingDate.toISOString().slice(0, 10),
                        totalAmount: journal.totalAmount.toString(),
                        currencyCode: journal.currencyCode,
                        postedBy: user.id ?? null,
                    },
                    metadata: { source: 'MANUAL', postedBy: user.id ?? null },
                },
            })

            return posted
        })

        return this.toManualJournalEntry(updated)
    }

    private toManualJournalEntry(journal: {
        id: string
        documentNumber: string | null
        postingDate: Date
        fiscalYear: number | null
        fiscalPeriodId: string | null
        totalAmount: Decimal
        currencyCode: string
        status: string
        approvalStatus: string
        description: string | null
        postedAt: Date | null
        lines: ManualJournalEntry['lines']
    }): ManualJournalEntry {
        return {
            id: journal.id,
            documentNumber: journal.documentNumber ?? '',
            postingDate: journal.postingDate,
            fiscalYear: journal.fiscalYear,
            fiscalPeriodId: journal.fiscalPeriodId,
            totalAmount: journal.totalAmount,
            currencyCode: journal.currencyCode,
            status: journal.status,
            approvalStatus: journal.approvalStatus,
            description: journal.description,
            postedAt: journal.postedAt,
            lines: journal.lines,
        }
    }


    async getEntry(id: string): Promise<JournalEntryDetail> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: {
                supplier: { select: JOURNAL_SUPPLIER_SELECT },
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    include: {
                        glAccount: {
                            select: {
                                id: true,
                                accountCode: true,
                                accountName: true,
                                accountType: true,
                            },
                        },
                    },
                },
                fiscalPeriod: {
                    select: {
                        id: true,
                        fiscalYear: true,
                        periodNumber: true,
                        name: true,
                        status: true,
                    },
                },
            },
        })

        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }

        const userLabels = await this.resolveUserDisplayMap([
            journal.postedBy,
            journal.createdBy,
        ])
        return {
            ...journal,
            approvalStatus: this.normalizeApprovalStatusForApi(
                journal.status,
                journal.approvalStatus,
            ),
            postedByName: this.userDisplayName(journal.postedBy, userLabels),
            postedByEmployeeCode: this.userEmployeeCode(
                journal.postedBy,
                userLabels,
            ),
        }
    }

    async simulatePosting(dto: CreateJournalEntryDto) {
        const postingDate = new Date(dto.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            return {
                valid: false,
                errors: [
                    {
                        code: 'INVALID_POSTING_DATE',
                        message: 'A valid posting date is required.',
                    },
                ],
            }
        }
        try {
            const result = await this.validation.validate({
                companyId: dto.companyId,
                postingDate,
                source: 'MANUAL',
                currencyCode: dto.currencyCode,
                lines: dto.lines.map((line) => ({
                    glAccountId: line.glAccountId,
                    debitAmount: Number(line.debitAmount) || 0,
                    creditAmount: Number(line.creditAmount) || 0,
                    currency: dto.currencyCode,
                })),
            })
            return {
                ...result,
                valid: true,
                fiscalPeriod: result.period
                    ? {
                          fiscalYear: result.period.fiscalYear,
                          periodNumber: result.period.periodNumber,
                          name: result.period.name,
                          status: result.period.status,
                      }
                    : null,
            }
        } catch (error) {
            let message = 'Validation failed.'
            if (error instanceof BadRequestException) {
                const body = error.getResponse()
                if (typeof body === 'string') {
                    message = body
                } else if (
                    body &&
                    typeof body === 'object' &&
                    'message' in body
                ) {
                    const raw = (body as { message?: string | { message?: string } })
                        .message
                    if (typeof raw === 'string') message = raw
                    else if (raw && typeof raw.message === 'string') {
                        message = raw.message
                    }
                }
            } else if (error instanceof Error) {
                message = error.message
            }
            return {
                valid: false,
                errors: [
                    {
                        code: 'VALIDATION_FAILED',
                        message,
                    },
                ],
            }
        }
    }

    async workbenchSummary(
        companyId: string,
        query: { dateFrom?: string; dateTo?: string },
    ) {
        const baseWhere = buildJournalListWhere({
            companyId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
        })
        const [byStatus, byApproval, total] = await Promise.all([
            this.prisma.ficoJournalEntry.groupBy({
                by: ['status'],
                where: baseWhere,
                _count: { _all: true },
            }),
            this.prisma.ficoJournalEntry.groupBy({
                by: ['approvalStatus'],
                where: { ...baseWhere, status: 'DRAFT' },
                _count: { _all: true },
            }),
            this.prisma.ficoJournalEntry.count({ where: baseWhere }),
        ])
        const statusMap = Object.fromEntries(
            byStatus.map((r) => [r.status, r._count._all]),
        )
        const approvalMap = Object.fromEntries(
            byApproval.map((r) => [r.approvalStatus, r._count._all]),
        )
        const automatic = await this.prisma.ficoJournalEntry.count({
            where: buildJournalListWhere({
                companyId,
                dateFrom: query.dateFrom,
                dateTo: query.dateTo,
                tab: 'automatic',
            }),
        })
        return {
            total,
            draft: statusMap.DRAFT ?? 0,
            posted: statusMap.POSTED ?? 0,
            reversed: statusMap.REVERSED ?? 0,
            cancelled: statusMap.CANCELLED ?? 0,
            pendingApproval: approvalMap.PENDING_APPROVAL ?? 0,
            readyToPost: await this.prisma.ficoJournalEntry.count({
                where: {
                    ...baseWhere,
                    status: 'DRAFT',
                    approvalStatus: 'APPROVED',
                },
            }),
            automatic,
        }
    }

    async listEntries(
        query: JournalEntryListQueryDto,
        currentUserId?: string | null,
    ): Promise<{
        items: JournalEntryListItem[]
        total: number
        page: number
        pageSize: number
        totalPages: number
    }> {
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
        const where = buildJournalListWhere(query, { currentUserId })

        const [items, total] = await Promise.all([
            this.prisma.ficoJournalEntry.findMany({
                where,
                orderBy: journalListOrderBy(query),
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    documentNumber: true,
                    documentType: true,
                    documentDate: true,
                    postingDate: true,
                    fiscalYear: true,
                    status: true,
                    approvalStatus: true,
                    totalAmount: true,
                    currencyCode: true,
                    description: true,
                    sourceModule: true,
                    sourceDocumentType: true,
                    sourceDocumentId: true,
                    supplierId: true,
                    supplier: { select: JOURNAL_SUPPLIER_SELECT },
                    createdBy: true,
                    postedBy: true,
                    postedAt: true,
                    createdAt: true,
                    lines: {
                        select: {
                            id: true,
                            lineNumber: true,
                        },
                    },
                    fiscalPeriod: {
                        select: {
                            fiscalYear: true,
                            periodNumber: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            }),
            this.prisma.ficoJournalEntry.count({ where }),
        ])

        const userLabels = await this.resolveUserDisplayMap(
            items.flatMap((row) => [row.postedBy, row.createdBy]),
        )
        const enriched = items.map((row) => ({
            ...row,
            approvalStatus: this.normalizeApprovalStatusForApi(
                row.status,
                row.approvalStatus,
            ),
            postedByName: this.userDisplayName(row.postedBy, userLabels),
            postedByEmployeeCode: this.userEmployeeCode(row.postedBy, userLabels),
        }))

        return {
            items: enriched,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        }
    }

    async reverseEntry(
        id: string,
        dto: ReverseJournalEntryDto,
        user: { id?: string; name?: string | null },
        options?: JournalReversalOptions,
    ): Promise<JournalReversalResult> {
        const original = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: {
                lines: {
                    orderBy: { lineNumber: 'asc' },
                },
                reversedBy: true,
            },
        })

        if (!original) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (original.companyId !== dto.companyId) {
            throw new BadRequestException('Company scope mismatch.')
        }

        const stableKey = `REVERSE:${original.id}`
        const existingReversal = await this.prisma.ficoJournalEntry.findFirst({
            where: {
                OR: [{ idempotencyKey: stableKey }, { reversalOfId: original.id }],
            },
            select: {
                id: true,
                documentNumber: true,
                postedAt: true,
            },
        })
        if (existingReversal) {
            return {
                originalId: original.id,
                originalStatus: 'REVERSED',
                reversalId: existingReversal.id,
                reversalDocumentNumber: existingReversal.documentNumber,
                reversalPostedAt: existingReversal.postedAt,
            }
        }

        if (original.status === 'REVERSED') {
            throw new BadRequestException('This journal entry has already been reversed.')
        }

        if (original.status !== 'POSTED') {
            throw new BadRequestException(
                `Only posted journal entries can be reversed. This entry has status ${original.status}.`,
            )
        }

        if (original.sourceModule?.toUpperCase() === 'AP' && !options?.apSubledgerReversal) {
            throw new BadRequestException(
                'Accounts Payable journals must be reversed through the AP subledger so open items and payment clearings remain reconciled.',
            )
        }
        if (original.sourceModule?.toUpperCase() === 'AR' && !options?.arSubledgerReversal) {
            throw new BadRequestException(
                'Accounts Receivable journals must be reversed through the AR subledger so open items remain reconciled.',
            )
        }

        if (!options?.operationalSourceReversal) {
            assertManualReversalAllowed(original.sourceModule)
        }

        if (!dto.reason || dto.reason.trim().length < 3) {
            throw new BadRequestException('A reversal reason of at least 3 characters is required.')
        }

        const reversalPostingDate = dto.postingDate
            ? new Date(dto.postingDate)
            : new Date()
        if (Number.isNaN(reversalPostingDate.getTime())) {
            throw new BadRequestException('A valid reversal posting date is required.')
        }

        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: original.companyId,
                periodType: 'NORMAL',
                startDate: { lte: reversalPostingDate },
                endDate: { gte: reversalPostingDate },
            },
            select: { id: true, fiscalYear: true, status: true },
        })
        if (
            !fiscalPeriod ||
            !['OPEN', 'RESTRICTED'].includes(fiscalPeriod.status)
        ) {
            throw new BadRequestException(
                'No open financial period covers the reversal posting date.',
            )
        }

        const reversed = await this.prisma.$transaction(async (tx) => {
            // Lock the original to prevent concurrent reversal.
            await tx.$queryRaw`
                SELECT id FROM fico_journal_entries
                WHERE id = ${original.id}
                FOR SHARE
            `

            const reversalType = resolveReversalDocumentType(original.documentType)

            const documentNumber = await this.postingEngine.allocateDocumentNumber(
                tx,
                original.companyId,
                reversalType.numberingKey,
                fiscalPeriod.fiscalYear,
            )

            // Lines cannot be inserted while header is already POSTED (DB trigger).
            const reversalDraft = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey: stableKey,
                    companyId: original.companyId,
                    postingDate: reversalPostingDate,
                    documentDate: reversalPostingDate,
                    fiscalYear: fiscalPeriod.fiscalYear,
                    fiscalPeriodId: fiscalPeriod.id,
                    totalAmount: original.totalAmount,
                    currencyCode: original.currencyCode,
                    status: 'DRAFT',
                    approvalStatus: 'DRAFT',
                    requiresApproval: false,
                    documentNumber,
                    documentType: reversalType.documentType,
                    sourceModule: original.sourceModule,
                    sourceDocumentType: original.sourceDocumentType,
                    sourceDocumentId: original.sourceDocumentId,
                    supplierId: original.supplierId,
                    description: `Reversal of ${original.documentNumber ?? original.id} — ${dto.reason.trim()}`,
                    reversalOfId: original.id,
                    createdBy: user.id ?? null,
                    lines: {
                        create: original.lines.map((line) => ({
                            lineNumber: line.lineNumber,
                            glAccountId: line.glAccountId,
                            companyId: original.companyId,
                            debitAmount: new Decimal(line.creditAmount.toString()),
                            creditAmount: new Decimal(line.debitAmount.toString()),
                            currency: original.currencyCode,
                            description: `Reverse of line ${line.lineNumber}`,
                        })),
                    },
                },
            })

            const reversal = await tx.ficoJournalEntry.update({
                where: { id: reversalDraft.id },
                data: {
                    status: 'POSTED',
                    approvalStatus: FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS,
                    postedAt: reversalPostingDate,
                    postedBy: user.id ?? null,
                },
            })

            // DB immutability allows POSTED → REVERSED when no other fields change.
            await tx.ficoJournalEntry.update({
                where: { id: original.id },
                data: { status: 'REVERSED' },
            })

            await options?.afterReverse?.(tx, { original, reversal })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: original.companyId,
                    action: 'JOURNAL_REVERSE',
                    entityType: 'FicoJournalEntry',
                    entityId: reversal.id,
                    previousValues: {
                        journalEntryId: original.id,
                        documentNumber: original.documentNumber,
                        status: original.status,
                    },
                    newValues: {
                        documentNumber: reversal.documentNumber,
                        reversedJournalEntryId: original.id,
                        reason: dto.reason.trim(),
                    },
                    metadata: {
                        idempotencyKey: `REVERSE:${original.id}:${Date.now()}`,
                    },
                },
            })

            return { original, reversal }
        })

        return {
            originalId: reversed.original.id,
            originalStatus: reversed.original.status,
            reversalId: reversed.reversal.id,
            reversalDocumentNumber: reversed.reversal.documentNumber,
            reversalPostedAt: reversed.reversal.postedAt,
        }
    }

    private normalizeApprovalStatusForApi(
        status: string,
        approvalStatus: string,
    ): string {
        if (
            status === 'POSTED' ||
            status === 'REVERSED' ||
            status === 'LEGACY'
        ) {
            return FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS
        }
        if (approvalStatus === 'PENDING_APPROVAL') {
            return FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS
        }
        return FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS
    }

    private async resolveUserDisplayMap(
        ids: Array<string | null | undefined>,
    ): Promise<
        Map<string, { name: string; employeeCode: string | null }>
    > {
        const unique = [
            ...new Set(ids.filter((id): id is string => Boolean(id))),
        ]
        if (!unique.length) {
            return new Map()
        }
        const users = await this.prisma.user.findMany({
            where: { id: { in: unique } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
                employeeCode: true,
            },
        })
        return new Map(
            users.map((user) => {
                const name =
                    [user.firstName, user.lastName]
                        .map((part) => part?.trim())
                        .filter(Boolean)
                        .join(' ')
                        .trim() || user.userName
                return [
                    user.id,
                    { name, employeeCode: user.employeeCode ?? null },
                ]
            }),
        )
    }

    private userDisplayName(
        userId: string | null | undefined,
        labels: Map<string, { name: string; employeeCode: string | null }>,
    ): string | null {
        if (!userId) return null
        return labels.get(userId)?.name ?? null
    }

    private userEmployeeCode(
        userId: string | null | undefined,
        labels: Map<string, { name: string; employeeCode: string | null }>,
    ): string | null {
        if (!userId) return null
        return labels.get(userId)?.employeeCode ?? null
    }

    private async settingsPrefix(companyId: string): Promise<string | null> {
        try {
            const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: { documentNumberPrefix: true },
            })
            return settings?.documentNumberPrefix ?? null
        } catch {
            return null
        }
    }

    private documentType(eventType: string) {
        if (eventType === 'GoodsReceiptPosted') return 'MM_GR'
        if (eventType === 'GoodsIssuePosted') return 'MM_GI'
        if (
            eventType === 'CustomerReturnRestocked' ||
            eventType === 'CustomerReturnPosted'
        ) {
            return 'MM_ADJUSTMENT'
        }
        if (
            [
                'GoodsReceiptReversed',
                'GoodsIssueReversed',
                'SupplierReturnPosted',
                'SupplierReturnReversed',
                'DisposalReversed',
            ].includes(eventType)
        ) {
            return 'MM_REVERSAL'
        }
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
