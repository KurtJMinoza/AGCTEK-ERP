import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export type QuotationMailAttachment = {
    filename: string
    content: Buffer
    contentType?: string
}

export type QuotationMailOptions = {
    to: string
    subject: string
    text: string
    html: string
    attachments: QuotationMailAttachment[]
}

export type QuotationMailResult = {
    sent: boolean
    messageId?: string
    skippedReason?: string
    error?: string
}

/**
 * SMTP delivery for quotation cover emails. Delivery is best-effort: the caller keeps the quotation
 * state and records the attempt; a transport failure never rolls SD work back.
 *
 * Dev uses Maildev through MAIL_* env (host/port, no auth needed); when no transport is configured
 * the send is reported as skipped rather than silently pretending to succeed. Production uses SMTP_*.
 */
@Injectable()
export class QuotationMailService {
    private readonly log = new Logger(QuotationMailService.name)
    private transporter: Transporter | null = null

    async sendQuotationEmail(options: QuotationMailOptions): Promise<QuotationMailResult> {
        // respect MAIL_ENABLED flag — when false, skip SMTP entirely
        if (process.env.MAIL_ENABLED === 'false') {
            this.log.log(`Mail skipped: MAIL_ENABLED=false (to=${options.to})`)
            return { sent: false, skippedReason: 'MAIL_ENABLED=false' }
        }

        if (!this.transporter) {
            this.transporter = this.initializeTransport()
        }

        if (!this.transporter) {
            this.log.log(`Mail skipped: no transporter configured (to=${options.to})`)
            return { sent: false, skippedReason: 'no_transporter_configured' }
        }

        try {
            const info = await this.transporter.sendMail({
                from: this.fromHeader(),
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
                attachments: options.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType ?? 'application/pdf',
                })),
            })

            return { sent: true, messageId: info.messageId }
        } catch (error) {
            this.log.error(
                `Failed to send quotation email to ${options.to}: ${error instanceof Error ? error.message : 'unknown'}`,
            )
            return { sent: false, error: 'Quotation email delivery failed' }
        }
    }

    private fromHeader(): string {
        // MAIL_FROM_NAME belongs to the shop OTP mailer, so quotation mail has its own name.
        const name = process.env.QUOTATION_MAIL_FROM_NAME?.trim() || 'AGCTEK Quotes'
        const address =
            process.env.QUOTATION_MAIL_FROM_ADDRESS?.trim() ||
            process.env.MAIL_FROM_ADDRESS?.trim() ||
            process.env.MAIL_FROM?.trim() ||
            'quotes@localhost'
        return `"${name}" <${address}>`
    }

    private initializeTransport(): Transporter | null {
        const env = process.env.NODE_ENV
        const host = process.env.MAIL_HOST?.trim()
        const port = Number(process.env.MAIL_PORT || 1025)
        const secure = process.env.MAIL_SECURE === 'true' || port === 465
        const user = process.env.MAIL_USERNAME?.trim()
        const pass = process.env.MAIL_PASSWORD?.trim()

        // --- Development: local SMTP catcher (Maildev / MailHog) ---
        if (env === 'development') {
            if (!host) {
                this.log.log('MAIL_HOST is not set; quotation email will be skipped in development.')
                return null
            }
            return nodemailer.createTransport({
                host,
                port,
                secure,
                auth: user && pass ? { user, pass } : undefined,
            })
        }

        // --- Production: configured SMTP ---
        if (env === 'production' || env === undefined) {
            const smtpHost = process.env.SMTP_HOST?.trim()
            const smtpPort = Number(process.env.SMTP_PORT || 587)
            const smtpUser = process.env.SMTP_USERNAME?.trim()
            const smtpPass = process.env.SMTP_PASSWORD?.trim()
            const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465

            if (!smtpHost) {
                this.log.log('SMTP_HOST not set; quotation email will be skipped.')
                return null
            }

            if (smtpUser && !smtpPass) {
                this.log.error('SMTP_USERNAME is set but SMTP_PASSWORD is empty.')
                throw new InternalServerErrorException('Email delivery is temporarily unavailable.')
            }

            return nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
            })
        }

        this.log.log('No mail transporter configured for current environment.')
        return null
    }
}
