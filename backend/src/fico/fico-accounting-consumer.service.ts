import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { FicoJournalService } from './fico-journal.service'

@Injectable()
export class FicoAccountingConsumerService {
    private readonly logger = new Logger(FicoAccountingConsumerService.name)

    constructor(private journal: FicoJournalService) {}

    @OnEvent('accounting.entry.requested', { async: true })
    async handleAccountingEntryRequested(
        payload: MmAccountingDispatchPayload,
    ): Promise<void> {
        if (!payload?.eventType || !payload?.companyId) {
            this.logger.warn('Ignoring accounting.entry.requested with missing fields')
            return
        }
        const result = await this.journal.createFromAccountingEvent(payload)
        if (result.duplicate) {
            this.logger.debug(
                `Duplicate accounting event consumed: ${payload.idempotencyKey ?? payload.documentId}`,
            )
        }
    }
}
