import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CrmMaildevClient, type MaildevEmailSummary } from './crm-maildev.client'

const SPAM_KEYWORDS =
    /\b(viagra|cialis|lottery|winner|crypto\s*giveaway|nigerian\s*prince|free\s*money|act\s*now!!!)\b/i

export type InboundSyncResult = {
    fetched: number
    imported: number
    skipped: number
}

@Injectable()
export class CrmEmailInboundService {
    private readonly log = new Logger(CrmEmailInboundService.name)
    private syncing = false

    constructor(
        private readonly prisma: PrismaService,
        private readonly maildev: CrmMaildevClient,
    ) {}

    inboundEnabled(): boolean {
        const flag = process.env.CRM_EMAIL_INBOUND_ENABLED?.trim().toLowerCase()
        if (flag === 'false' || flag === '0') return false
        if (flag === 'true' || flag === '1') return true
        // Default on in non-production when MailDev URL is available.
        return process.env.NODE_ENV !== 'production'
    }

    async syncFromMaildev(): Promise<InboundSyncResult> {
        if (this.syncing) {
            return { fetched: 0, imported: 0, skipped: 0 }
        }
        this.syncing = true
        try {
            const emails = await this.maildev.listEmails()
            let imported = 0
            let skipped = 0
            for (const email of emails) {
                const result = await this.importOne(email)
                if (result === 'imported') imported += 1
                else skipped += 1
            }
            if (imported > 0) {
                this.log.log(
                    `MailDev inbound sync: fetched=${emails.length} imported=${imported} skipped=${skipped}`,
                )
            }
            return { fetched: emails.length, imported, skipped }
        } finally {
            this.syncing = false
        }
    }

    /** Exposed for unit tests. */
    async importOne(email: MaildevEmailSummary): Promise<'imported' | 'skipped'> {
        const providerMessageId = String(email.id ?? '').trim()
        if (!providerMessageId) return 'skipped'

        const existing = await this.prisma.crmEmailMessage.findUnique({
            where: { providerMessageId },
            select: { id: true },
        })
        if (existing) return 'skipped'

        const fromEmail = firstAddress(email.from)
        const to = firstAddress(email.to) || 'unknown@localhost'
        const toName = firstName(email.to)
        const subject = (email.subject ?? '').trim()
        const bodyText = (email.text ?? stripTags(email.html ?? '')).trim()
        const bodyHtml = email.html?.trim() || null
        const smtpMessageId = normalizeMessageId(email.messageId)

        if (isOurOutboundFrom(fromEmail)) return 'skipped'

        if (smtpMessageId) {
            const ours = await this.prisma.crmEmailMessage.findFirst({
                where: { smtpMessageId, direction: 'OUTBOUND' },
                select: { id: true },
            })
            if (ours) return 'skipped'
        }

        const isSpam = SPAM_KEYWORDS.test(`${subject}\n${bodyText}`)
        const receivedAt = email.time ? new Date(email.time) : new Date()
        const customer = fromEmail
            ? await this.prisma.sdCustomer.findFirst({
                  where: { email: { equals: fromEmail, mode: 'insensitive' } },
                  select: { id: true },
              })
            : null

        await this.prisma.crmEmailMessage.create({
            data: {
                direction: 'INBOUND',
                status: 'RECEIVED',
                toEmail: to,
                toName,
                fromEmail: fromEmail || null,
                subject,
                bodyText,
                bodyHtml,
                customerId: customer?.id ?? null,
                isSpam,
                provider: 'MAILDEV',
                providerMessageId,
                smtpMessageId: smtpMessageId || null,
                receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
                createdBy: 'system:maildev',
                updatedBy: 'system:maildev',
            },
        })
        return 'imported'
    }
}

export function isOurOutboundFrom(fromEmail: string | null): boolean {
    if (!fromEmail) return false
    const candidates = [
        process.env.QUOTATION_MAIL_FROM_ADDRESS,
        process.env.MAIL_FROM_ADDRESS,
        parseAngleAddress(process.env.MAIL_FROM),
        'quotes@localhost',
    ]
        .map((v) => v?.trim().toLowerCase())
        .filter(Boolean) as string[]
    return candidates.includes(fromEmail.trim().toLowerCase())
}

export function looksLikeSpam(subject: string, bodyText: string): boolean {
    return SPAM_KEYWORDS.test(`${subject}\n${bodyText}`)
}

function firstAddress(list?: { address?: string; name?: string }[]): string | null {
    const raw = list?.[0]?.address?.trim()
    return raw || null
}

function firstName(list?: { address?: string; name?: string }[]): string | null {
    const raw = list?.[0]?.name?.trim()
    return raw || null
}

function parseAngleAddress(value?: string | null): string | null {
    if (!value) return null
    const match = value.match(/<([^>]+)>/)
    if (match?.[1]) return match[1].trim()
    if (value.includes('@')) return value.replace(/^"|"$/g, '').trim()
    return null
}

function normalizeMessageId(value?: string | null): string | null {
    if (!value) return null
    return value.trim().replace(/^<|>$/g, '') || null
}

function stripTags(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
