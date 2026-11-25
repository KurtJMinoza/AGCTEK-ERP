import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { FicoAccountingEventProcessorService } from './fico-accounting-event-processor.service'

@Injectable()
export class FicoAccountingConsumerService {
    private readonly logger = new Logger(FicoAccountingConsumerService.name)

    constructor(private readonly processor: FicoAccountingEventProcessorService) {}

    @OnEvent('accounting.entry.requested', { async: true })
    async handleAccountingEntryRequested(
        payload: MmAccountingDispatchPayload,
    ): Promise<void> {
        if (!payload?.eventType || !payload?.companyId) {
            this.logger.warn('Ignoring accounting.entry.requested with missing fields')
            return
        }
        await this.processor.processDispatch(payload)
    }
}
