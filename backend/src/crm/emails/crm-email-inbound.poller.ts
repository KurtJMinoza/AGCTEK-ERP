import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { CrmEmailInboundService } from './crm-email-inbound.service'

const DEFAULT_INTERVAL_MS = 15_000

/**
 * Dev poller for MailDev → CRM Inbox/Spam. Uses setInterval (no @nestjs/schedule dep).
 */
@Injectable()
export class CrmEmailInboundPoller implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(CrmEmailInboundPoller.name)
    private timer: ReturnType<typeof setInterval> | null = null

    constructor(private readonly inbound: CrmEmailInboundService) {}

    onModuleInit() {
        if (!this.inbound.inboundEnabled()) {
            this.log.log('CRM email inbound poller disabled')
            return
        }
        const ms = Number(process.env.CRM_EMAIL_INBOUND_POLL_MS) || DEFAULT_INTERVAL_MS
        this.log.log(`CRM email inbound poller every ${ms}ms → MailDev`)
        void this.inbound.syncFromMaildev()
        this.timer = setInterval(() => {
            void this.inbound.syncFromMaildev()
        }, ms)
        if (typeof this.timer.unref === 'function') this.timer.unref()
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer)
        this.timer = null
    }
}
