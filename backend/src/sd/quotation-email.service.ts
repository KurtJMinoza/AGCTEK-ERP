import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QuotationMailService } from './mail.service'
import { QuotationPdfService } from './quotation-pdf.service'
import { formatQuotationAmount, QUOTATION_PDF_DEFAULT_COMPANY } from './quotation-pdf.model'
import { manilaDate } from './quotation.rules'
import { QuotationService, recordQuotationEvent, type QuotationView } from './quotation.service'
import {
    BUILT_IN_QUOTATION_EMAIL_TEMPLATES,
    DEFAULT_QUOTATION_EMAIL_TEMPLATE,
    isQuotationEmailTemplateKey,
    quotationEmailTemplateKeyFromName,
    quotationEmailTextToHtml,
    renderQuotationEmailTemplate,
    restoreQuotationEmailPlaceholders,
    RESEND_QUOTATION_EMAIL_TEMPLATE,
    type QuotationEmailVars,
} from './quotation-email-template'
import {
    quotationDocumentFilename,
    readQuotationDocumentPdf,
    rewriteQuotationDocumentPdf,
    saveQuotationDocumentPdf,
} from './quotation-document-storage'

const QUOTATION_EMAIL_MODULE = 'QUOTATION'

/** Only a quotation the customer has already been offered may be emailed. */
const EMAILABLE_STATUSES: ReadonlySet<string> = new Set(['SENT', 'ACCEPTED'])

type CustomerRow = {
    companyName: string
    contactName: string | null
    email: string | null
} | null

type TemplateRow = {
    key: string
    name: string
    subject: string
    bodyText: string
    bodyHtml: string | null
    isDefault: boolean
    isActive: boolean
    module: string
    updatedAt: Date
}

export type QuotationEmailTemplateView = {
    key: string
    name: string
    subject: string
    bodyText: string
    bodyHtml: string | null
    isDefault: boolean
    isActive: boolean
    updatedAt: Date
}

export type UpdateQuotationEmailTemplateInput = {
    name?: string
    subject?: string
    bodyText?: string
    /** Null clears an authored HTML body (the plain text is then converted on send). */
    bodyHtml?: string | null
    isDefault?: boolean
    isActive?: boolean
}

export type SendQuotationEmailInput = {
    templateKey?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    isResend?: boolean
}

export type SaveQuotationEmailTemplateInput = {
    name: string
    subject: string
    bodyText: string
}

export type QuotationEmailPreview = {
    to: string | null
    customerName: string
    quotationNumber: string
    revision: number
    templateKey: string
    templates: QuotationEmailTemplateView[]
    subject: string
    bodyText: string
    bodyHtml: string
    attachmentFilename: string
    hasStoredPdf: boolean
    lastEmailedAt: Date | null
}

export type QuotationEmailSendResult = {
    sent: boolean
    messageId?: string
    skippedReason?: string
    error?: string
    to: string
    subject: string
    attachmentFilename: string
    lastEmailedAt: Date | null
}

type StoredDocument = { document: Prisma.SdQuotationDocumentGetPayload<object>; buffer: Buffer }

/**
 * SD-owned quotation email: templates, preview, cover letter and PDF attachment.
 *
 * The quotation PDF remains the commercial source of truth. Its bytes are stored once per
 * `(quotation, revision)` on the first successful email and reused for resends, so the attachment
 * and the in-app download are always the same document. Only an offered quotation (SENT /
 * ACCEPTED) is emailed: Send (DRAFT → SENT) stays its own step, so a failed delivery never changes
 * the quotation status; failures are recorded in the lifecycle history and surfaced to the caller.
 */
@Injectable()
export class QuotationEmailService {
    private readonly log = new Logger(QuotationEmailService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly quotations: QuotationService,
        private readonly pdf: QuotationPdfService,
        private readonly mail: QuotationMailService,
    ) {}

    /** Active templates for the composer; administrators may list inactive ones too. */
    async listTemplates(includeInactive = false): Promise<QuotationEmailTemplateView[]> {
        const rows = await this.prisma.sdEmailTemplate.findMany({
            where: {
                module: QUOTATION_EMAIL_MODULE,
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: [{ name: 'asc' }],
        })
        return rows.map((row) => this.templateView(row))
    }

    /** Edits copy only; the key and module stay fixed so send/resend still resolve a template. */
    async updateTemplate(key: string, input: UpdateQuotationEmailTemplateInput) {
        const existing = await this.prisma.sdEmailTemplate.findFirst({
            where: { key, module: QUOTATION_EMAIL_MODULE },
        })
        if (!existing) throw new NotFoundException('Email template not found')

        const data: Prisma.SdEmailTemplateUpdateInput = {
            ...(input.name !== undefined && { name: input.name.trim() }),
            ...(input.subject !== undefined && { subject: input.subject.trim() }),
            ...(input.bodyText !== undefined && { bodyText: input.bodyText }),
            ...(input.bodyHtml !== undefined && { bodyHtml: input.bodyHtml?.trim() || null }),
            ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            if (input.isDefault) {
                await tx.sdEmailTemplate.updateMany({
                    where: { module: QUOTATION_EMAIL_MODULE, key: { not: key } },
                    data: { isDefault: false },
                })
            }
            return tx.sdEmailTemplate.update({ where: { id: existing.id }, data })
        })
        return this.templateView(updated)
    }

    /**
     * Saves the composer's current subject/body as a reusable QUOTATION template. Rendered values are
     * turned back into `{{placeholders}}` where they came from this quotation, so the template does
     * not freeze one customer's name, quote number or totals.
     */
    async createTemplateFromQuotation(
        id: string,
        input: SaveQuotationEmailTemplateInput,
    ): Promise<QuotationEmailTemplateView> {
        const quote = await this.quotations.findOne(id)
        const customer = await this.loadCustomer(quote.customerId)
        const vars = await this.buildVars(quote, customer, quote.sentBy ?? quote.createdBy)

        const name = input.name.trim()
        const subject = restoreQuotationEmailPlaceholders(input.subject.trim(), vars)
        const bodyText = restoreQuotationEmailPlaceholders(input.bodyText, vars)
        if (!subject) {
            throw new BadRequestException({
                code: 'QUOTATION_EMAIL_TEMPLATE_SUBJECT_REQUIRED',
                message: 'The email subject cannot be empty.',
            })
        }
        if (!bodyText.trim()) {
            throw new BadRequestException({
                code: 'QUOTATION_EMAIL_TEMPLATE_BODY_REQUIRED',
                message: 'The email message cannot be empty.',
            })
        }

        const base = quotationEmailTemplateKeyFromName(name)
        for (let attempt = 1; attempt <= 20; attempt++) {
            const key = attempt === 1 ? base : `${base}_${attempt}`
            try {
                const row = await this.prisma.sdEmailTemplate.create({
                    data: { key, name, subject, bodyText, module: QUOTATION_EMAIL_MODULE },
                })
                return this.templateView(row)
            } catch (error) {
                if ((error as Prisma.PrismaClientKnownRequestError)?.code !== 'P2002') throw error
            }
        }
        throw new ConflictException({
            code: 'QUOTATION_EMAIL_TEMPLATE_KEY_CONFLICT',
            message: 'Could not allocate a key for the new template; try a more specific name.',
        })
    }

    /**
     * Rendered composer content: the template copy with this quotation's values, plus the recipient,
     * attachment name and whether a stored PDF already exists. Read-only.
     */
    async preview(id: string, templateKey?: string): Promise<QuotationEmailPreview> {
        const quote = await this.quotations.findOne(id)
        const customer = await this.loadCustomer(quote.customerId)
        const key = this.resolveTemplateKey(templateKey, Boolean(quote.lastEmailedAt))
        const template = await this.loadTemplate(key)
        const vars = await this.buildVars(quote, customer, quote.sentBy ?? quote.createdBy)
        const renderedText = renderQuotationEmailTemplate(template.bodyText, vars)
        const document = await this.prisma.sdQuotationDocument.findUnique({
            where: { quotationId_revision: { quotationId: id, revision: quote.revision } },
        })

        return {
            to: customer?.email?.trim() || null,
            customerName: vars.customerName,
            quotationNumber: quote.quotationNumber,
            revision: quote.revision,
            templateKey: key,
            templates: await this.listTemplates(),
            subject: renderQuotationEmailTemplate(template.subject, vars),
            bodyText: renderedText,
            bodyHtml: template.bodyHtml
                ? renderQuotationEmailTemplate(template.bodyHtml, vars)
                : quotationEmailTextToHtml(renderedText),
            attachmentFilename: quotationDocumentFilename(quote.quotationNumber, quote.revision),
            hasStoredPdf: Boolean(document),
            lastEmailedAt: quote.lastEmailedAt,
        }
    }

    /**
     * Emails the quotation PDF with the selected (or default) template, letting the composer
     * override the subject and body for this send only. Requires SENT / ACCEPTED and a customer
     * email; the stored PDF is created on first use and reused by resends.
     */
    async send(id: string, input: SendQuotationEmailInput, userId: string): Promise<QuotationEmailSendResult> {
        const quote = await this.quotations.findOne(id)
        this.assertEmailable(quote)

        const customer = await this.loadCustomer(quote.customerId)
        const to = customer?.email?.trim()
        if (!to) {
            throw new BadRequestException({
                code: 'QUOTATION_NO_CUSTOMER_EMAIL',
                message:
                    'The customer has no email address. Add one in Customer Master before emailing the quotation.',
            })
        }

        const active = quote
        const resend = input.isResend ?? Boolean(active.lastEmailedAt)
        const key = this.resolveTemplateKey(input.templateKey, resend)
        const template = await this.loadTemplate(key)
        const vars = await this.buildVars(active, customer, userId)

        const customBody = input.bodyText?.trim()
        const bodyText = customBody || renderQuotationEmailTemplate(template.bodyText, vars)
        const subject = input.subject?.trim() || renderQuotationEmailTemplate(template.subject, vars)
        const bodyHtml =
            input.bodyHtml?.trim() ||
            (!customBody && template.bodyHtml
                ? renderQuotationEmailTemplate(template.bodyHtml, vars)
                : quotationEmailTextToHtml(bodyText))

        const { document, buffer } = await this.ensureDocument(active, userId)
        const attachmentFilename = quotationDocumentFilename(active.quotationNumber, active.revision)

        let result: Awaited<ReturnType<QuotationMailService['sendQuotationEmail']>>
        try {
            result = await this.mail.sendQuotationEmail({
                to,
                subject,
                text: bodyText,
                html: bodyHtml,
                attachments: [
                    {
                        filename: attachmentFilename,
                        content: buffer,
                        contentType: document.contentType,
                    },
                ],
            })
        } catch (error) {
            await recordQuotationEvent(this.prisma, {
                quotationId: id,
                action: 'EMAIL_FAILED',
                fromStatus: active.status,
                toStatus: active.status,
                actorId: userId,
                note: error instanceof Error ? error.message : 'Quotation email delivery failed',
            })
            throw error
        }

        const now = new Date()
        if (result.sent) {
            await this.prisma.sdQuotation.update({
                where: { id },
                data: { lastEmailedAt: now },
            })
            await recordQuotationEvent(this.prisma, {
                quotationId: id,
                action: resend ? 'EMAIL_RESENT' : 'EMAIL_SENT',
                fromStatus: active.status,
                toStatus: active.status,
                actorId: userId,
                note: `Emailed to ${to} (${attachmentFilename})`,
            })
            this.log.log(
                `Quotation ${quote.quotationNumber} rev ${quote.revision} emailed to ${to}${resend ? ' (resend)' : ''}`,
            )
            return {
                sent: true,
                messageId: result.messageId,
                to,
                subject,
                attachmentFilename,
                lastEmailedAt: now,
            }
        }

        const reason = result.error ?? result.skippedReason ?? 'Email skipped'
        await recordQuotationEvent(this.prisma, {
            quotationId: id,
            action: result.error ? 'EMAIL_FAILED' : 'EMAIL_SKIPPED',
            fromStatus: active.status,
            toStatus: active.status,
            actorId: userId,
            note: reason,
        })
        this.log.warn(
            `Quotation ${quote.quotationNumber} rev ${quote.revision} not emailed to ${to}: ${
                result.error ?? result.skippedReason ?? 'unknown'
            }`,
        )
        return {
            sent: false,
            skippedReason: result.skippedReason,
            error: result.error,
            to,
            subject,
            attachmentFilename,
            lastEmailedAt: active.lastEmailedAt,
        }
    }

    /**
     * The stored PDF of this revision for in-app download/view. 404 until the rep has emailed the
     * quotation; if the row exists but the file is gone, it is regenerated from the frozen quotation.
     */
    async storedDocument(id: string): Promise<{ buffer: Buffer; filename: string }> {
        const quote = await this.quotations.findOne(id)
        const existing = await this.prisma.sdQuotationDocument.findUnique({
            where: { quotationId_revision: { quotationId: id, revision: quote.revision } },
        })
        if (!existing) {
            throw new NotFoundException({
                code: 'QUOTATION_PDF_NOT_STORED',
                message: 'No sent PDF is stored for this quotation revision yet; email the quotation first.',
            })
        }

        const { buffer } = await this.ensureExistingDocument(quote, existing)
        return {
            buffer,
            filename: quotationDocumentFilename(quote.quotationNumber, quote.revision),
        }
    }

    private assertEmailable(quote: QuotationView) {
        if (!EMAILABLE_STATUSES.has(quote.effectiveStatus)) {
            throw new ConflictException({
                code: 'QUOTATION_NOT_EMAILABLE',
                message:
                    quote.effectiveStatus === 'DRAFT'
                        ? 'Send the quotation first; the email then attaches the frozen PDF.'
                        : `Cannot email the quotation: it is ${quote.effectiveStatus}`,
            })
        }
    }

    private resolveTemplateKey(requested: string | undefined, resend: boolean): string {
        // Custom templates saved from the composer are valid keys too; loadTemplate rejects unknown
        // ones with a clear 400 instead of silently falling back to another template.
        if (requested) return requested
        return resend ? RESEND_QUOTATION_EMAIL_TEMPLATE : DEFAULT_QUOTATION_EMAIL_TEMPLATE
    }

    /** Seeded/edited/custom row when present; the built-in copy keeps email working on an unseeded DB. */
    private async loadTemplate(key: string) {
        const row = await this.prisma.sdEmailTemplate.findUnique({ where: { key } })
        if (!row) {
            const fallback = isQuotationEmailTemplateKey(key)
                ? BUILT_IN_QUOTATION_EMAIL_TEMPLATES[key]
                : null
            if (!fallback) {
                throw new BadRequestException({
                    code: 'QUOTATION_EMAIL_TEMPLATE_INVALID',
                    message: `Unknown quotation email template: ${key}`,
                })
            }
            return { key, name: fallback.name, subject: fallback.subject, bodyText: fallback.bodyText, bodyHtml: null }
        }
        if (!row.isActive) {
            throw new ConflictException({
                code: 'QUOTATION_EMAIL_TEMPLATE_INACTIVE',
                message: `The email template "${row.name}" is inactive; activate it or choose another template.`,
            })
        }
        return { key, name: row.name, subject: row.subject, bodyText: row.bodyText, bodyHtml: row.bodyHtml }
    }

    private loadCustomer(customerId: string): Promise<CustomerRow> {
        return this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { companyName: true, contactName: true, email: true },
        })
    }

    private async buildVars(
        quote: QuotationView,
        customer: CustomerRow,
        repId: string | null,
    ): Promise<QuotationEmailVars> {
        const [opportunity, rep, company] = await Promise.all([
            this.prisma.crmOpportunity.findUnique({
                where: { id: quote.crmOpportunityId },
                select: { name: true },
            }),
            repId
                ? this.prisma.user.findUnique({
                      where: { id: repId },
                      select: { userName: true, firstName: true, lastName: true },
                  })
                : Promise.resolve(null),
            this.prisma.company.findFirst({
                where: { code: QUOTATION_PDF_DEFAULT_COMPANY },
                select: { name: true },
            }),
        ])

        const repName =
            [rep?.firstName, rep?.lastName].filter(Boolean).join(' ').trim() || rep?.userName || 'AGCTEK Sales'
        return {
            customerName: customer?.companyName?.trim() || 'Customer',
            contactName: customer?.contactName?.trim() || '',
            quotationNumber: quote.quotationNumber,
            revision: String(quote.revision),
            amount: formatQuotationAmount(Number(quote.totalAmount ?? 0)),
            currency: quote.currency || 'PHP',
            validUntil: quote.validUntil ? manilaDate(quote.validUntil) : 'not set',
            companyName: company?.name?.trim() || QUOTATION_PDF_DEFAULT_COMPANY,
            repName,
            opportunityName: opportunity?.name ?? '',
        }
    }

    /**
     * Finds or creates this revision's stored PDF. The unique `(quotationId, revision)` index makes a
     * concurrent first email safe: the loser re-reads the winner's document.
     */
    private async ensureDocument(quote: QuotationView, userId: string | null): Promise<StoredDocument> {
        const existing = await this.prisma.sdQuotationDocument.findUnique({
            where: { quotationId_revision: { quotationId: quote.id, revision: quote.revision } },
        })
        if (existing) return this.ensureExistingDocument(quote, existing)

        const buffer = await this.renderPdf(quote.id)
        const stored = saveQuotationDocumentPdf(buffer)
        try {
            const document = await this.prisma.sdQuotationDocument.create({
                data: {
                    quotationId: quote.id,
                    revision: quote.revision,
                    createdBy: userId,
                    ...stored,
                },
            })
            await recordQuotationEvent(this.prisma, {
                quotationId: quote.id,
                action: 'PDF_STORED',
                fromStatus: quote.status,
                toStatus: quote.status,
                actorId: userId,
                note: `Stored ${quotationDocumentFilename(quote.quotationNumber, quote.revision)} (${stored.byteSize} bytes)`,
            })
            return { document, buffer }
        } catch (error) {
            if ((error as Prisma.PrismaClientKnownRequestError)?.code !== 'P2002') throw error
            const raced = await this.prisma.sdQuotationDocument.findUnique({
                where: { quotationId_revision: { quotationId: quote.id, revision: quote.revision } },
            })
            if (!raced) throw error
            return { document: raced, buffer: readQuotationDocumentPdf(raced.storageKey) ?? buffer }
        }
    }

    /** Uses the stored bytes; regenerates only when the file is missing, keeping the same row/key. */
    private async ensureExistingDocument(
        quote: QuotationView,
        existing: Prisma.SdQuotationDocumentGetPayload<object>,
    ): Promise<StoredDocument> {
        const stored = readQuotationDocumentPdf(existing.storageKey)
        if (stored) return { document: existing, buffer: stored }

        const buffer = await this.renderPdf(quote.id)
        const meta = rewriteQuotationDocumentPdf(existing.storageKey, buffer)
        const document = await this.prisma.sdQuotationDocument.update({
            where: { id: existing.id },
            data: { byteSize: meta.byteSize, checksum: meta.checksum, contentType: meta.contentType },
        })
        this.log.warn(
            `Stored PDF for quotation ${quote.quotationNumber} rev ${quote.revision} was missing; regenerated it`,
        )
        return { document, buffer }
    }

    private renderPdf(quotationId: string): Promise<Buffer> {
        return this.quotations.pdfInput(quotationId).then((input) => this.pdf.render(input))
    }

    private templateView(row: TemplateRow): QuotationEmailTemplateView {
        return {
            key: row.key,
            name: row.name,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
            isDefault: row.isDefault,
            isActive: row.isActive,
            updatedAt: row.updatedAt,
        }
    }
}
