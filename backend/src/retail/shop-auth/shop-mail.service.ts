import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import nodemailer from 'nodemailer'
import type Transporter from 'nodemailer/lib/mailer'

@Injectable()
export class ShopMailService {
    private readonly log = new Logger(ShopMailService.name)
    private transporter: Transporter | null = null

    async sendOtpEmail(to: string, code: string): Promise<void> {
        const fromName = process.env.MAIL_FROM_NAME?.trim() || 'AGC Shop'
        const fromAddress =
            process.env.MAIL_FROM_ADDRESS?.trim() || 'noreply@agctek.local'
        const subject = 'Your AGC Shop verification code'
        const text = `Hello,

Your verification code is:

${code}

This code expires in 10 minutes.

If you did not request this code, you can ignore this email.

AGC Shop`
        const html = `<p>Hello,</p>
<p>Your verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes.</p>
<p>If you did not request this code, you can ignore this email.</p>
<p>AGC Shop</p>`

        if (process.env.NODE_ENV === 'test') {
            return
        }

        try {
            await this.transport().sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to,
                subject,
                text,
                html,
            })
        } catch (error) {
            this.log.error(
                `Failed to send OTP email to ${to}: ${error instanceof Error ? error.message : 'unknown'}`,
            )
            throw new InternalServerErrorException(
                'Email delivery is temporarily unavailable.',
            )
        }
    }

    private transport(): Transporter {
        if (this.transporter) return this.transporter
        const host = process.env.SMTP_HOST?.trim()
        const port = Number(process.env.SMTP_PORT || 587)
        const user = process.env.SMTP_USERNAME?.trim()
        const pass = process.env.SMTP_PASSWORD?.trim()
        const secure =
            process.env.SMTP_SECURE === 'true' || port === 465

        if (!host) {
            this.log.error(
                'SMTP_HOST is not set; cannot send shop OTP emails.',
            )
            throw new InternalServerErrorException(
                'Email delivery is temporarily unavailable.',
            )
        }

        if (user && !pass) {
            this.log.error(
                'SMTP_USERNAME is set but SMTP_PASSWORD is empty; use a Gmail App Password (see backend/.env.example).',
            )
            throw new InternalServerErrorException(
                'Email delivery is temporarily unavailable.',
            )
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: user && pass ? { user, pass } : undefined,
        })
        return this.transporter
    }
}
