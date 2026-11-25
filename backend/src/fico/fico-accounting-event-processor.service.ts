import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'
import {
    FICO_ACCOUNTING_ERROR_CODES,
    FICO_ACCOUNTING_MAX_ATTEMPTS,
    FICO_ACCOUNTING_PROCESSING_STALE_MS,
    type FicoAccountingEventStatus,
} from './fico-accounting-event.constants'
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
    code: string
    message: string
    retryable: boolean
} {
    if (err instanceof ConflictException) {
        return {
            code: FICO_ACCOUNTING_ERROR_CODES.CONFLICT,
            message: err.message,
            retryable: false,
        }
    }
    if (isAccountingDeterminationError(err)) {
        return {
            code: FICO_ACCOUNTING_ERROR_CODES.DETERMINATION,
            message: err.message,
            retryable: true,
        }
    }
    if (err instanceof BadRequestException) {
        const message = err.message
        const period =
            message.toLowerCase().includes('period') ||
            message.toLowerCase().includes('fiscal')
        const determination =
            message.toLowerCase().includes('account') ||
            message.toLowerCase().includes('determination')
        return {
            code: period
                ? FICO_ACCOUNTING_ERROR_CODES.PERIOD
                : determination
                  ? FICO_ACCOUNTING_ERROR_CODES.DETERMINATION
                  : FICO_ACCOUNTING_ERROR_CODES.VALIDATION,
            message,
            retryable: determination || period,
        }
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
        @Optional()
        private readonly accountsPayable?: FicoAccountsPayableService,
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
            return
        }

        try {
            if (eventId) {
                await this.assertPayloadCompatible(eventId, payload)
            }
            const result = this.accountsPayable?.supportsAccountingPayload(payload)
                ? await this.accountsPayable.postMatchedSupplierInvoice(payload)
                : await this.journal.createFromAccountingEvent(payload)
            if (result.duplicate) {
                await this.linkExistingJournal(eventId, payload.idempotencyKey)
            } else if (eventId && result.journalEntryId) {
                await this.linkExistingJournal(eventId, payload.idempotencyKey)
            }
        } catch (err) {
            const classified = classifyError(err)
            if (eventId) {
                await this.markFailed(eventId, classified.code, classified.message)
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
        if (event.attemptCount >= FICO_ACCOUNTING_MAX_ATTEMPTS) {
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
                    { status: 'FAILED' },
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
            return
        }
        if (idempotencyKey) {
            await this.prisma.mmAccountingEvent.updateMany({
                where: { idempotencyKey },
                data,
            })
        }
    }

    private async markFailed(eventId: string, code: string, message: string) {
        const event = await this.prisma.mmAccountingEvent.findUnique({
            where: { id: eventId },
            select: { attemptCount: true },
        })
        const attempts = event?.attemptCount ?? 0
        await this.prisma.mmAccountingEvent.update({
            where: { id: eventId },
            data: {
                status:
                    attempts >= FICO_ACCOUNTING_MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
                lastError: message.slice(0, 2000),
                lastErrorCode: code,
                processingStartedAt: null,
                lastAttemptAt: new Date(),
            },
        })
    }

    private async linkExistingJournal(
        eventId: string | undefined,
        idempotencyKey?: string,
    ) {
        if (!idempotencyKey) return
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey },
            select: { id: true },
        })
        if (!journal) return
        if (eventId) {
            await this.prisma.mmAccountingEvent.update({
                where: { id: eventId },
                data: {
                    status: 'CONSUMED',
                    journalEntryId: journal.id,
                    consumedAt: new Date(),
                    processingStartedAt: null,
                },
            })
        }
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
