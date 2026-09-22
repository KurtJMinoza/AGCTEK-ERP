import { Injectable, Logger } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'

export type CreateJournalResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
}

@Injectable()
export class FicoJournalService {
    private readonly logger = new Logger(FicoJournalService.name)

    constructor(private prisma: PrismaService) {}

    async createFromAccountingEvent(
        payload: MmAccountingDispatchPayload,
    ): Promise<CreateJournalResult> {
        const idempotencyKey =
            payload.idempotencyKey ??
            `${payload.eventType}:${payload.documentType}:${payload.documentId}`

        const totalAmount = new Decimal(payload.totalValue ?? 0).abs()
        const postingDate = new Date(payload.postingDate)

        try {
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
        } catch (err: any) {
            if (err?.code === 'P2002') {
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
                        lastError: String(err?.message ?? err).slice(0, 2000),
                    },
                })
            }
            throw err
        }
    }
}
