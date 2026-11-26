import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import {
    FICO_ACCOUNTING_MAX_ATTEMPTS,
    FICO_ACCOUNTING_RECOVERY_BATCH_SIZE,
    FICO_ACCOUNTING_RECOVERY_DEFAULT_INTERVAL_MS,
} from './fico-accounting-event.constants'
import { FicoAccountingEventProcessorService } from './fico-accounting-event-processor.service'

/**
 * Phase 03 — persistent recovery when in-process `accounting.entry.requested`
 * notifications are missed (process restart, emitter failure).
 */
@Injectable()
export class FicoAccountingEventRecoveryService
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(FicoAccountingEventRecoveryService.name)
    private timer: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(
        private readonly prisma: PrismaService,
        private readonly processor: FicoAccountingEventProcessorService,
    ) {}

    onModuleInit() {
        if (process.env.FICO_ACCOUNTING_RECOVERY_ENABLED === 'false') {
            this.logger.log('Accounting event recovery worker disabled.')
            return
        }
        const intervalMs = Number(
            process.env.FICO_ACCOUNTING_RECOVERY_INTERVAL_MS ??
                FICO_ACCOUNTING_RECOVERY_DEFAULT_INTERVAL_MS,
        )
        this.timer = setInterval(() => {
            void this.tick().catch((error) => {
                this.logger.error(
                    `Accounting recovery tick failed: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                )
            })
        }, intervalMs)
        void this.tick()
        this.logger.log(
            `Accounting event recovery worker started (interval ${intervalMs}ms).`,
        )
    }

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    async tick(): Promise<{ recovered: number; dispatched: number }> {
        if (this.running) {
            return { recovered: 0, dispatched: 0 }
        }
        this.running = true
        try {
            const recovered = await this.processor.recoverStaleProcessing()
            const dispatched = await this.processPendingBatch()
            if (recovered > 0 || dispatched > 0) {
                this.logger.debug(
                    `Recovery tick: ${recovered} stale reclaimed, ${dispatched} pending dispatched.`,
                )
            }
            return { recovered, dispatched }
        } finally {
            this.running = false
        }
    }

    async processPendingBatch(
        limit = FICO_ACCOUNTING_RECOVERY_BATCH_SIZE,
    ): Promise<number> {
        const now = new Date()
        const rows = await this.prisma.mmAccountingEvent.findMany({
            where: {
                OR: [
                    {
                        status: 'PENDING',
                        retryEligible: true,
                    },
                    {
                        status: 'RETRY_SCHEDULED',
                        retryAfter: { lte: now },
                    },
                ],
                attemptCount: { lt: FICO_ACCOUNTING_MAX_ATTEMPTS },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
            select: {
                id: true,
                payload: true,
                idempotencyKey: true,
            },
        })

        for (const row of rows) {
            const payload = {
                ...(row.payload as object),
                mmAccountingEventId: row.id,
                idempotencyKey: row.idempotencyKey ?? undefined,
            } as MmAccountingDispatchPayload
            await this.processor.processDispatch(payload)
        }
        return rows.length
    }
}