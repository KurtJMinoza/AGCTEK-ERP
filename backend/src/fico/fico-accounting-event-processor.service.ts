import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'
import { FicoTaxPostingSnapshotService } from './fico-tax-posting-snapshot.service'
import {
    FICO_ACCOUNTING_ERROR_CODES,
    FICO_ACCOUNTING_MAX_ATTEMPTS,
    FICO_ACCOUNTING_PROCESSING_STALE_MS,
    type FicoAccountingErrorCode,
    type FicoAccountingEventStatus,
} from './fico-accounting-event.constants'
import { ficoAccountingRetryDelayMs } from './fico-accounting-event-state.policy'
import {
    FicoAccountingDeterminationException,
    isAccountingDeterminationError,
} from './fico-accounting-determination.exception'

const NON_POSTING_MM_EVENTS = new Set([
    'InventoryValuationUpdated',
    'InventoryValuationReversed',
    'InventoryTransferred',
    'InventoryTransactionReversed',
])

function classifyError(err: unknown): {
    code: FicoAccountingErrorCode
    message: string
    retryable: boolean
} {
    if (err instanceof ConflictException) {
        const ambiguous = err.message.toLowerCase().includes('ambiguous')
        return {
            code: ambiguous
                ? FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_AMBIGUOUS
                : FICO_ACCOUNTING_ERROR_CODES.CONFLICT,
            message: err.message,
            retryable: !ambiguous,
        }
    }
    if (isAccountingDeterminationError(err)) {
        const ambiguous = err.message.toLowerCase().includes('ambiguous')
        return {
            code: ambiguous
                ? FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_AMBIGUOUS
                : FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_NOT_FOUND,
            message: err.message,
            retryable: !ambiguous,
        }
    }
    if (err instanceof BadRequestException) {
        const message = err.message
        const lower = message.toLowerCase()
        const code = (() => {
            if (
                lower.includes('unbalanced') ||
                lower.includes('debit') && lower.includes('credit')
            ) {
                return FICO_ACCOUNTING_ERROR_CODES.JOURNAL_UNBALANCED
            }
            if (
                lower.includes('restricted') &&
                (lower.includes('period') || lower.includes('fiscal'))
            ) {
                return FICO_ACCOUNTING_ERROR_CODES.POSTING_PERIOD_RESTRICTED
            }
            if (
                lower.includes('period') ||
                lower.includes('fiscal') ||
                lower.includes('closed')
            ) {
                return FICO_ACCOUNTING_ERROR_CODES.POSTING_PERIOD_CLOSED
            }
            if (lower.includes('inactive') && lower.includes('accounting')) {
                return FICO_ACCOUNTING_ERROR_CODES.COMPANY_ACCOUNTING_INACTIVE
            }
            if (lower.includes('not postable') || lower.includes('blocked')) {
                return FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_NOT_POSTABLE
            }
            if (lower.includes('ambiguous') && lower.includes('rule')) {
                return FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_AMBIGUOUS
            }
            if (lower.includes('determination') || lower.includes('account mapping')) {
                return FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_NOT_FOUND
            }
            if (lower.includes('valuation')) {
                return FICO_ACCOUNTING_ERROR_CODES.VALUATION_MISSING
            }
            if (lower.includes('tax')) {
                return FICO_ACCOUNTING_ERROR_CODES.TAX_CONFIGURATION_INVALID
            }
            if (lower.includes('subledger') || lower.includes('payable')) {
                return FICO_ACCOUNTING_ERROR_CODES.SUBLEDGER_VALIDATION_FAILED
            }
            if (lower.includes('currency')) {
                return FICO_ACCOUNTING_ERROR_CODES.CURRENCY_VALIDATION_FAILED
            }
            if (lower.includes('document') && lower.includes('invalid')) {
                return FICO_ACCOUNTING_ERROR_CODES.SOURCE_DOCUMENT_INVALID
            }
            return FICO_ACCOUNTING_ERROR_CODES.VALIDATION
        })()
        const retryable =
            code === FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_NOT_FOUND ||
            code === FICO_ACCOUNTING_ERROR_CODES.POSTING_PERIOD_CLOSED
        return { code, message, retryable }
    }
    const message =
        err instanceof Error ? err.message : String(err ?? 'Unknown error')
    return {
        code: FICO_ACCOUNTING_ERROR_CODES.UNKNOWN,
        message,
        retryable: true,
    }
}

@Injectable()
export class FicoAccountingEventProcessorService {
    private readonly logger = new Logger(FicoAccountingEventProcessorService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly journal: FicoJournalService,
        private readonly events: EventEmitter2,
        @Optional()
        private readonly accountsPayable?: FicoAccountsPayableService,
        @Optional()
        private readonly accountsReceivable?: FicoAccountsReceivableService,
        @Optional()
        private readonly taxSnapshots?: FicoTaxPostingSnapshotService,
    ) {}

    async processDispatch(payload: MmAccountingDispatchPayload): Promise<void> {
        const eventId = payload.mmAccountingEventId
        if (eventId) {
            const claim = await this.claimEvent(eventId)
            if (!claim) {
                this.logger.debug(
                    `Skip dispatch — event ${eventId} not claimable.`,
                )
                return
            }
            this.publishAccountingStatus(payload, 'PROCESSING')
        }

        if (
            payload.financiallyRelevant === false ||
            NON_POSTING_MM_EVENTS.has(payload.eventType)
        ) {
            await this.markSkipped(
                eventId,
                payload.idempotencyKey,
                'Event marked non-financial; no journal required.',
            )
            this.publishAccountingStatus(payload, 'SKIPPED', {
                outcomeReason: 'Event marked non-financial; no journal required.',
                lastErrorCode: FICO_ACCOUNTING_ERROR_CODES.NON_FINANCIAL,
            })
            return
        }

        try {
            if (eventId) {
                await this.assertPayloadCompatible(eventId, payload)
            }
            const result = this.accountsPayable?.supportsAccountingPayload(payload)
                ? await this.accountsPayable.postMatchedSupplierInvoice(payload)
                : this.accountsReceivable?.supportsAccountingPayload(payload)
                  ? await this.accountsReceivable.postFromAccountingEvent(payload)
                  : await this.journal.createFromAccountingEvent(payload)
            if (result.journalEntryId) {
                await this.linkExistingJournal(
                    eventId,
                    payload.idempotencyKey,
                    result.journalEntryId,
                )
                if (this.taxSnapshots) {
                    await this.taxSnapshots
                        .captureFromDispatch(payload, result.journalEntryId)
                        .catch(() => undefined)
                }
                this.publishAccountingStatus(payload, 'CONSUMED')
            }
        } catch (err) {
            const classified = classifyError(err)
            if (eventId) {
                await this.markFailed(
                    eventId,
                    classified.code,
                    classified.message,
                    classified.retryable,
                )
                const failed = await this.prisma.mmAccountingEvent.findUnique({
                    where: { id: eventId },
                    select: { status: true },
                })
                this.publishAccountingStatus(payload, failed?.status ?? 'FAILED', {
                    lastErrorCode: classified.code,
                })
            } else if (payload.idempotencyKey) {
                await this.prisma.mmAccountingEvent.updateMany({
                    where: { idempotencyKey: payload.idempotencyKey },
                    data: {
                        status: 'FAILED',
                        lastError: classified.message.slice(0, 2000),
                        lastErrorCode: classified.code,
                        lastAttemptAt: new Date(),
                    },
                })
            }
            if (!classified.retryable) {
                this.logger.warn(
                    `Accounting dispatch failed (non-retryable): ${classified.message}`,
                )
            } else {
                this.logger.error(
                    `Accounting dispatch failed (retryable): ${classified.message}`,
                )
            }
        }
    }

    async retryEvent(eventId: string): Promise<FicoAccountingEventStatus> {
        const event = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
        })
        if (!event) {
            throw new BadRequestException('Accounting event not found.')
        }
        if (event.status === 'CONSUMED' || event.status === 'SKIPPED') {
            throw new BadRequestException(
                `Cannot retry event in status ${event.status}.`,
            )
        }
        const resurrect =
            event.status === 'DEAD_LETTER' || event.status === 'FAILED'
        await this.prisma.mmAccountingEvent.update({
            where: { id: eventId },
            data: {
                status: 'PENDING',
                retryAfter: null,
                retryEligible: true,
                ...(resurrect ? { attemptCount: 0 } : {}),
            },
        })
        if (
            !resurrect &&
            event.attemptCount >= FICO_ACCOUNTING_MAX_ATTEMPTS
        ) {
            throw new BadRequestException(
                'Maximum retry attempts exceeded for this accounting event.',
            )
        }
        const payload = {
            ...(event.payload as object),
            mmAccountingEventId: event.id,
            idempotencyKey: event.idempotencyKey ?? undefined,
        } as MmAccountingDispatchPayload
        await this.processDispatch(payload)
        const refreshed = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { status: true },
        })
        return (refreshed?.status ?? 'FAILED') as FicoAccountingEventStatus
    }

    async recoverStaleProcessing(): Promise<number> {
        const cutoff = new Date(Date.now() - FICO_ACCOUNTING_PROCESSING_STALE_MS)
        const result = await this.prisma.mmAccountingEvent.updateMany({
            where: {
                status: 'PROCESSING',
                processingStartedAt: { lt: cutoff },
            },
            data: {
                status: 'PENDING',
                processingStartedAt: null,
            },
        })
        return result.count
    }

    private async claimEvent(eventId: string): Promise<boolean> {
        const staleCutoff = new Date(
            Date.now() - FICO_ACCOUNTING_PROCESSING_STALE_MS,
        )
        const result = await this.prisma.mmAccountingEvent.updateMany({
            where: {
                id: eventId,
                OR: [
                    { status: 'PENDING' },
                    {
                        status: 'RETRY_SCHEDULED',
                        OR: [
                            { retryAfter: null },
                            { retryAfter: { lte: new Date() } },
                        ],
                    },
                    {
                        status: 'PROCESSING',
                        processingStartedAt: { lt: staleCutoff },
                    },
                ],
            },
            data: {
                status: 'PROCESSING',
                processingStartedAt: new Date(),
                lastAttemptAt: new Date(),
                attemptCount: { increment: 1 },
            },
        })
        return result.count === 1
    }

    private async markSkipped(
        eventId: string | undefined,
        idempotencyKey: string | undefined,
        reason: string,
    ) {
        const data: Prisma.MmAccountingEventUpdateManyMutationInput = {
            status: 'SKIPPED',
            outcomeReason: reason.slice(0, 2000),
            consumedAt: new Date(),
            processingStartedAt: null,
            lastError: null,
            lastErrorCode: FICO_ACCOUNTING_ERROR_CODES.NON_FINANCIAL,
        }
        if (eventId) {
            await this.prisma.mmAccountingEvent.update({
                where: { id: eventId },
                data,
            })
            const stored = await this.prisma.mmAccountingEvent.findUnique({
                where: { id: eventId },
                select: { documentType: true, documentId: true, companyId: true },
            })
            if (stored?.documentType && stored.documentId) {
                this.events.emit('accounting.event.status.changed', {
                    documentType: stored.documentType,
                    documentId: stored.documentId,
                    companyId: stored.companyId,
                    eventStatus: 'SKIPPED',
                    outcomeReason: reason,
                    lastErrorCode: FICO_ACCOUNTING_ERROR_CODES.NON_FINANCIAL,
                })
            }
            return
        }
        if (idempotencyKey) {
            await this.prisma.mmAccountingEvent.updateMany({
                where: { idempotencyKey },
                data,
            })
        }
    }

    private async markFailed(
        eventId: string,
        code: string,
        message: string,
        retryable: boolean,
    ) {
        const event = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { attemptCount: true },
        })
        const attempts = event?.attemptCount ?? 0
        const deadLetter = attempts >= FICO_ACCOUNTING_MAX_ATTEMPTS
        const delayMs = ficoAccountingRetryDelayMs(attempts)
        await this.prisma.mmAccountingEvent.update({
            where: { id: eventId },
            data: {
                status: deadLetter
                    ? 'DEAD_LETTER'
                    : retryable
                      ? 'RETRY_SCHEDULED'
                      : 'FAILED',
                retryEligible: !deadLetter,
                retryAfter: deadLetter
                    ? null
                    : new Date(Date.now() + delayMs),
                lastError: message.slice(0, 2000),
                lastErrorCode: code,
                processingStartedAt: null,
                lastAttemptAt: new Date(),
                processedAt: new Date(),
            },
        })
    }

    private async linkExistingJournal(
        eventId: string | undefined,
        idempotencyKey?: string,
        journalEntryIdHint?: string,
    ) {
        let journalId = journalEntryIdHint ?? null
        if (!journalId && idempotencyKey) {
            const journal = await this.prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey },
                select: { id: true },
            })
            journalId = journal?.id ?? null
        }
        if (!journalId || !eventId) return
        const existing = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { journalEntryIds: true },
        })
        const priorIds = Array.isArray(existing?.journalEntryIds)
            ? (existing!.journalEntryIds as string[])
            : []
        const merged = [...new Set([...priorIds, journalId])]
        await this.prisma.mmAccountingEvent.update({
            where: { id: eventId },
            data: {
                status: 'CONSUMED',
                journalEntryId: journalId,
                journalEntryIds: merged,
                consumedAt: new Date(),
                processedAt: new Date(),
                processingStartedAt: null,
                lastError: null,
                lastErrorCode: null,
                retryAfter: null,
            } as Prisma.MmAccountingEventUpdateInput,
        })
    }

    private publishAccountingStatus(
        payload: MmAccountingDispatchPayload,
        eventStatus: string,
        extra?: {
            outcomeReason?: string
            lastErrorCode?: string
            isReversal?: boolean
        },
    ) {
        const documentType =
            typeof payload.documentType === 'string' ? payload.documentType : null
        const documentId =
            typeof payload.documentId === 'string' ? payload.documentId : null
        if (!documentType || !documentId) return
        this.events.emit('accounting.event.status.changed', {
            documentType,
            documentId,
            companyId: payload.companyId,
            eventStatus,
            outcomeReason: extra?.outcomeReason,
            lastErrorCode: extra?.lastErrorCode,
            isReversal:
                extra?.isReversal ??
                String(payload.eventType ?? '')
                    .toUpperCase()
                    .includes('REVERSED'),
        })
    }

    private async assertPayloadCompatible(
        eventId: string,
        incoming: MmAccountingDispatchPayload,
    ) {
        const stored = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { payload: true, status: true },
        })
        if (!stored?.payload || typeof stored.payload !== 'object') return
        const prior = stored.payload as { financialFingerprint?: string }
        const next = incoming as { financialFingerprint?: string }
        if (
            prior.financialFingerprint &&
            next.financialFingerprint &&
            prior.financialFingerprint !== next.financialFingerprint
        ) {
            throw new ConflictException(
                'Idempotent accounting event received with different financial content.',
            )
        }
    }
}
