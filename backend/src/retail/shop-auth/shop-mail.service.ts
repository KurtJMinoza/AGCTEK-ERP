import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common'
import nodemailer from 'nodemailer'
import type Transporter from 'nodemailer/lib/mailer'

const SHOP_BRAND = 'Amalgated Shop'

@Injectable()
export class ShopMailService {
    private readonly log = new Logger(ShopMailService.name)
    private transporter: Transporter | null = null

    async sendOtpEmail(to: string, code: string): Promise<void> {
        const fromName = process.env.MAIL_FROM_NAME?.trim() || SHOP_BRAND
        const fromAddress =
            process.env.MAIL_FROM_ADDRESS?.trim() || 'noreply@agctek.local'
        const subject = `Your ${SHOP_BRAND} verification code`
        const text = `Hello,

Your verification code is:

${code}

This code expires in 10 minutes.

If you did not request this code, you can ignore this email.

${SHOP_BRAND}`

        if (process.env.NODE_ENV === 'test') {
            return
        }

        const logoPath =
            process.env.SHOP_LOGO_PATH?.trim() ||
            path.resolve(process.cwd(), '..', 'public', 'storefront', 'aci.png')
        let logoContent: Buffer | null = null
        try {
            logoContent = await readFile(logoPath)
        } catch {
            // Missing logo asset: send plain branded email instead of failing.
        }
        const logoHtml = logoContent
            ? `<p><img src="cid:aci-logo" alt="${SHOP_BRAND}" style="width:120px;height:auto" /></p>`
            : ''
        const html = `${logoHtml}<p>Hello,</p>
<p>Your verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes.</p>
<p>If you did not request this code, you can ignore this email.</p>
<p>${SHOP_BRAND}</p>`
        const attachments = logoContent
            ? [
                  {
                      filename: 'aci.png',
                      content: logoContent,
                      cid: 'aci-logo',
                      contentType: 'image/png',
                  },
              ]
            : undefined

        try {
            await this.transport().sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to,
                subject,
                text,
                html,
                ...(attachments ? { attachments } : {}),
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
        const secure = process.env.SMTP_SECURE === 'true' || port === 465

        if (!host) {
            this.log.error('SMTP_HOST is not set; cannot send shop OTP emails.')
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
