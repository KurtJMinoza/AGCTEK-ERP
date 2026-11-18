import { Injectable, Logger } from '@nestjs/common'

export type MaildevAddress = {
    address?: string
    name?: string
}

export type MaildevEmailSummary = {
    id: string
    time?: string | Date
    from?: MaildevAddress[]
    to?: MaildevAddress[]
    subject?: string
    text?: string
    html?: string
    messageId?: string
}

/**
 * Thin HTTP client for MailDev's REST API (dev SMTP catch-all web UI).
 * No new dependency — uses fetch.
 */
@Injectable()
export class CrmMaildevClient {
    private readonly log = new Logger(CrmMaildevClient.name)

    baseUrl(): string {
        return (
            process.env.MAILDEV_WEB_URL?.trim().replace(/\/$/, '') ||
            'http://127.0.0.1:8025'
        )
    }

    async listEmails(): Promise<MaildevEmailSummary[]> {
        const url = `${this.baseUrl()}/email`
        try {
            const res = await fetch(url)
            if (!res.ok) {
                this.log.warn(`MailDev list failed: HTTP ${res.status} ${url}`)
                return []
            }
            const data = (await res.json()) as unknown
            return Array.isArray(data) ? (data as MaildevEmailSummary[]) : []
        } catch (error) {
            this.log.warn(
                `MailDev unreachable at ${url}: ${error instanceof Error ? error.message : 'unknown'}`,
            )
            return []
        }
    }
}
