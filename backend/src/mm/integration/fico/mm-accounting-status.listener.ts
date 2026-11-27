import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MmAccountingDocumentStatusService } from './mm-accounting-document-status.service'

export type AccountingEventStatusChangedPayload = {
    documentType: string
    documentId: string
    companyId?: string | null
    eventStatus: string
    outcomeReason?: string | null
    lastErrorCode?: string | null
    isReversal?: boolean
}

@Injectable()
export class MmAccountingStatusListener {
    constructor(private readonly status: MmAccountingDocumentStatusService) {}

    @OnEvent('accounting.event.status.changed', { async: true })
    async onAccountingStatusChanged(
        payload: AccountingEventStatusChangedPayload,
    ): Promise<void> {
        if (!payload?.documentType || !payload?.documentId) return
        await this.status.applyEventOutcome(payload)
    }
}