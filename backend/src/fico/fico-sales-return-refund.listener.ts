import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SD_EVENTS, type SdReturnRefundPaidPayload } from '../sd/sd-event.types'
import { FicoSalesReturnRefundService } from './fico-sales-return-refund.service'

@Injectable()
export class FicoSalesReturnRefundListener {
    private readonly logger = new Logger(FicoSalesReturnRefundListener.name)

    constructor(private readonly refunds: FicoSalesReturnRefundService) {}

    @OnEvent(SD_EVENTS.RETURN_REFUND_PAID, { async: true })
    async handleReturnRefundPaid(
        envelope:
            | SdReturnRefundPaidPayload
            | { payload?: SdReturnRefundPaidPayload },
    ): Promise<void> {
        const event = this.unwrap(envelope)
        if (!event?.refundId || !event?.companyId) {
            this.logger.warn('Ignoring ReturnRefundPaid with missing fields')
            return
        }
        try {
            const result = await this.refunds.postFromRefundPaid(event)
            if (result.duplicate) {
                this.logger.debug(
                    `Duplicate sales-return refund journal skipped: ${event.idempotencyKey}`,
                )
            } else if (result.created) {
                this.logger.log(
                    `Sales-return refund journal ${result.journalEntryId} posted for ${event.refundNumber}`,
                )
            }
        } catch (err: unknown) {
            // Refund settlement in SD must not roll back because FICO failed;
            // monitor via logs / posting retries.
            this.logger.error(
                `Sales-return refund posting failed for ${event.refundNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    private unwrap<T extends object>(
        envelope: T | { payload?: T },
    ): T | undefined {
        if (
            envelope &&
            typeof envelope === 'object' &&
            'payload' in envelope &&
            envelope.payload &&
            typeof envelope.payload === 'object'
        ) {
            return envelope.payload
        }
        return envelope as T
    }
}
