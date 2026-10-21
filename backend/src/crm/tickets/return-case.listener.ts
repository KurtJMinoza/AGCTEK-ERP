import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SD_EVENTS, type SdReturnRequestRequestedPayload } from '../../sd/sd-event.types'
import { CrmReturnCasesService } from './return-cases.service'

/**
 * Storefront return → CRM case. Errors propagate to SD's emitter, which logs them and leaves the
 * outbox row PENDING; `POST /crm/tickets/from-return/:returnRequestId` opens the case later.
 */
@Injectable()
export class CrmReturnCaseListener {
    constructor(private readonly cases: CrmReturnCasesService) {}

    @OnEvent(SD_EVENTS.RETURN_REQUEST_REQUESTED, { suppressErrors: false })
    async onReturnRequested(envelope: { payload: SdReturnRequestRequestedPayload }) {
        await this.cases.openForReturn(envelope.payload.returnRequestId, null)
    }
}
