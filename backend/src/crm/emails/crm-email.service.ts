import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    createDocumentStorage,
    sanitizeDocumentFileName,
    UnsupportedDocumentTypeError,
} from '../../common/document-storage'
import { QuotationMailService, type QuotationMailAttachment } from '../../sd/mail.service'
import { QuotationEmailService } from '../../sd/quotation-email.service'
import { quotationDocumentFilename } from '../../sd/quotation-document-storage'
import type {
    ListCrmEmailsQueryDto,
    UpdateCrmEmailDraftDto,
    UploadCrmEmailAttachmentDto,
    UpsertCrmEmailDraftDto,
} from './dto/crm-email.dto'

export type SetStarredInput = { starred: boolean }
export type SetSpamInput = { isSpam: boolean }

const storage = createDocumentStorage('crm', 'emails')

const MAX_UPLOADS = 10
const MAX_TOTAL_BYTES = 15 * 1024 * 1024
const MAX_FILE_BYTES = 10 * 1024 * 1024

const UPLOAD_EXT = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.txt',
])

const MESSAGE_INCLUDE = {
    attachments: { orderBy: { createdAt: 'asc' as const } },
    customer: { select: { id: true, companyName: true, email: true } },
    opportunity: { select: { id: true, name: true } },
    quotation: { select: { id: true, quotationNumber: true, revision: true, status: true } },
} satisfies Prisma.CrmEmailMessageInclude

type MessageRow = Prisma.CrmEmailMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>

@Injectable()
export class CrmEmailService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: QuotationMailService,
        private readonly quotationEmail: QuotationEmailService,
    ) {}

    async list(query: ListCrmEmailsQueryDto) {
        const folder = query.folder ?? 'sent'
        const limit = query.limit ?? 50

        const folderWhere: Prisma.CrmEmailMessageWhereInput =
            folder === 'inbox'
                ? { direction: 'INBOUND', isSpam: false, status: 'RECEIVED' }
                : folder === 'spam'
                  ? { direction: 'INBOUND', isSpam: true, status: 'RECEIVED' }
                  : folder === 'starred'
                    ? { starred: true }
                    : folder === 'drafts'
                      ? { status: 'DRAFT', direction: 'OUTBOUND' }
                      : { status: { in: ['SENT', 'FAILED'] }, direction: 'OUTBOUND' }

        const q = query.q?.trim()
        const where: Prisma.CrmEmailMessageWhereInput = q
            ? {
                  AND: [
                      folderWhere,
                      {
                          OR: [
                              { toEmail: { contains: q, mode: 'insensitive' } },
                              { toName: { contains: q, mode: 'insensitive' } },
                              { fromEmail: { contains: q, mode: 'insensitive' } },
                              { subject: { contains: q, mode: 'insensitive' } },
                              { bodyText: { contains: q, mode: 'insensitive' } },
                          ],
                      },
                  ],
              }
            : folderWhere

        const inboundFolder = folder === 'inbox' || folder === 'spam'
        const rows = await this.prisma.crmEmailMessage.findMany({
            where,
            include: MESSAGE_INCLUDE,
            orderBy:
                folder === 'drafts'
                    ? [{ updatedAt: 'desc' }, { id: 'desc' }]
                    : inboundFolder
                      ? [{ receivedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }]
                      : [{ sentAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
            take: limit,
        })
        return rows.map((row) => this.view(row))
    }

    async setStarred(id: string, input: SetStarredInput, userId: string) {
        await this.load(id)
        await this.prisma.crmEmailMessage.update({
            where: { id },
            data: {
                starred: Boolean(input.starred),
                updatedBy: userId,
            },
        })
        return this.view(await this.load(id))
    }

    async setSpam(id: string, input: SetSpamInput, userId: string) {
        const existing = await this.load(id)
        if (existing.direction !== 'INBOUND') {
            throw new ConflictException('Only inbound messages can be moved to Spam.')
        }
        await this.prisma.crmEmailMessage.update({
            where: { id },
            data: {
                isSpam: Boolean(input.isSpam),
                updatedBy: userId,
            },
        })
        return this.view(await this.load(id))
    }

    async findOne(id: string) {
        return this.view(await this.load(id))
    }

    async upsertDraft(dto: UpsertCrmEmailDraftDto, userId: string) {
        const toEmail = dto.toEmail.trim()
        if (!toEmail.includes('@')) {
            throw new BadRequestException('Enter a valid recipient email address.')
        }

        const links = await this.resolveLinks({
            customerId: dto.customerId,
            opportunityId: dto.opportunityId,
            quotationId: dto.quotationId,
        })

        if (dto.id) {
            const existing = await this.load(dto.id)
            if (existing.status !== 'DRAFT') {
                throw new ConflictException('Only drafts can be edited.')
            }
            const updated = await this.prisma.crmEmailMessage.update({
                where: { id: existing.id },
                data: {
                    toEmail,
                    toName: dto.toName?.trim() || null,
                    subject: dto.subject?.trim() ?? existing.subject,
                    bodyText: dto.bodyText ?? existing.bodyText,
                    bodyHtml: dto.bodyHtml ?? existing.bodyHtml,
                    customerId: links.customerId,
                    opportunityId: links.opportunityId,
                    quotationId: links.quotationId,
                    quotationRevision: links.quotationRevision,
                    templateKey: dto.templateKey?.trim() || null,
                    updatedBy: userId,
                },
                include: MESSAGE_INCLUDE,
            })
            await this.syncQuotationPdfAttachment(updated.id, links)
            return this.view(await this.load(updated.id))
        }

        const created = await this.prisma.crmEmailMessage.create({
            data: {
                direction: 'OUTBOUND',
                status: 'DRAFT',
                toEmail,
                toName: dto.toName?.trim() || null,
                subject: dto.subject?.trim() ?? '',
                bodyText: dto.bodyText ?? '',
                bodyHtml: dto.bodyHtml ?? null,
                customerId: links.customerId,
                opportunityId: links.opportunityId,
                quotationId: links.quotationId,
                quotationRevision: links.quotationRevision,
                templateKey: dto.templateKey?.trim() || null,
                createdBy: userId,
                updatedBy: userId,
            },
            include: MESSAGE_INCLUDE,
        })
        await this.syncQuotationPdfAttachment(created.id, links)
        return this.view(await this.load(created.id))
    }

    async updateDraft(id: string, dto: UpdateCrmEmailDraftDto, userId: string) {
        const existing = await this.load(id)
        if (existing.status !== 'DRAFT') {
            throw new ConflictException('Only drafts can be edited.')
        }

        const links = await this.resolveLinks({
            customerId: dto.customerId === undefined ? existing.customerId : dto.customerId,
            opportunityId:
                dto.opportunityId === undefined ? existing.opportunityId : dto.opportunityId,
            quotationId: dto.quotationId === undefined ? existing.quotationId : dto.quotationId,
        })

        await this.prisma.crmEmailMessage.update({
            where: { id },
            data: {
                toEmail: dto.toEmail?.trim() ?? existing.toEmail,
                toName: dto.toName === undefined ? existing.toName : dto.toName?.trim() || null,
                subject: dto.subject === undefined ? existing.subject : dto.subject.trim(),
                bodyText: dto.bodyText === undefined ? existing.bodyText : dto.bodyText,
                bodyHtml: dto.bodyHtml === undefined ? existing.bodyHtml : dto.bodyHtml,
                customerId: links.customerId,
                opportunityId: links.opportunityId,
                quotationId: links.quotationId,
                quotationRevision: links.quotationRevision,
                templateKey:
                    dto.templateKey === undefined
                        ? existing.templateKey
                        : dto.templateKey?.trim() || null,
                updatedBy: userId,
            },
        })
        await this.syncQuotationPdfAttachment(id, links)
        return this.view(await this.load(id))
    }

    async uploadAttachment(id: string, dto: UploadCrmEmailAttachmentDto, userId: string) {
        const message = await this.load(id)
        if (message.status !== 'DRAFT') {
            throw new ConflictException('Attachments can only be added to drafts.')
        }

        const uploads = message.attachments.filter((a) => a.kind === 'UPLOAD')
        if (uploads.length >= MAX_UPLOADS) {
            throw new BadRequestException(`At most ${MAX_UPLOADS} uploaded files are allowed.`)
        }

        const buffer = Buffer.from(dto.contentBase64, 'base64')
        if (buffer.length === 0) throw new BadRequestException('The file is empty.')
        if (buffer.length > MAX_FILE_BYTES) {
            throw new PayloadTooLargeException('Each file is limited to 10 MB.')
        }
        const used = uploads.reduce((sum, a) => sum + a.byteSize, 0)
        if (used + buffer.length > MAX_TOTAL_BYTES) {
            throw new PayloadTooLargeException('Attachments are limited to 15 MB total.')
        }

        const fileName = sanitizeDocumentFileName(dto.fileName)
        const ext = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : ''
        if (!UPLOAD_EXT.has(ext)) {
            throw new BadRequestException(`Unsupported file type: ${ext || 'unknown'}`)
        }

        let storageKey: string
        try {
            storageKey = storage.buildKey('message', id, fileName)
        } catch (error) {
            if (error instanceof UnsupportedDocumentTypeError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }
        storage.save(storageKey, buffer)

        try {
            await this.prisma.crmEmailAttachment.create({
                data: {
                    messageId: id,
                    kind: 'UPLOAD',
                    fileName,
                    mimeType: dto.mimeType ?? null,
                    byteSize: buffer.length,
                    storageKey,
                },
            })
            await this.prisma.crmEmailMessage.update({
                where: { id },
                data: { updatedBy: userId },
            })
        } catch (error) {
            storage.remove(storageKey)
            throw error
        }

        return this.view(await this.load(id))
    }

    async removeAttachment(id: string, attachmentId: string, userId: string) {
        const message = await this.load(id)
        if (message.status !== 'DRAFT') {
            throw new ConflictException('Attachments can only be removed from drafts.')
        }
        const attachment = message.attachments.find((a) => a.id === attachmentId)
        if (!attachment) throw new NotFoundException('Attachment not found.')
        if (attachment.kind === 'QUOTATION_PDF') {
            throw new ConflictException('The quotation PDF is managed by the linked quotation.')
        }

        await this.prisma.crmEmailAttachment.delete({ where: { id: attachmentId } })
        storage.remove(attachment.storageKey)
        await this.prisma.crmEmailMessage.update({
            where: { id },
            data: { updatedBy: userId },
        })
        return this.view(await this.load(id))
    }

    async send(id: string, userId: string) {
        const message = await this.load(id)
        if (message.status !== 'DRAFT' && message.status !== 'FAILED') {
            throw new ConflictException('Only drafts (or failed attempts) can be sent.')
        }
        if (!message.toEmail.includes('@')) {
            throw new BadRequestException('Enter a valid recipient email address.')
        }
        if (!message.subject.trim() || !message.bodyText.trim()) {
            throw new BadRequestException('Subject and message are required.')
        }

        if (message.quotationId) {
            const result = await this.quotationEmail.send(
                message.quotationId,
                {
                    subject: message.subject,
                    bodyText: message.bodyText,
                    bodyHtml: message.bodyHtml ?? undefined,
                    templateKey: message.templateKey ?? undefined,
                    isResend: Boolean(
                        (
                            await this.prisma.sdQuotation.findUnique({
                                where: { id: message.quotationId },
                                select: { lastEmailedAt: true },
                            })
                        )?.lastEmailedAt,
                    ),
                },
                userId,
                {
                    crmMessageId: message.id,
                    extraAttachments: await this.uploadBuffers(message),
                    toOverride: message.toEmail,
                    toName: message.toName,
                },
            )
            return {
                ...this.view(await this.load(message.id)),
                delivery: result,
            }
        }

        const attachments = await this.uploadBuffers(message)
        const html =
            message.bodyHtml?.trim() ||
            message.bodyText
                .split(/\n{2,}/)
                .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
                .join('')

        const sentResult = await this.mail.sendQuotationEmail({
            to: message.toEmail,
            subject: message.subject.trim(),
            text: message.bodyText,
            html,
            attachments,
        })

        if (sentResult.sent) {
            await this.prisma.crmEmailMessage.update({
                where: { id: message.id },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    lastError: null,
                    updatedBy: userId,
                    smtpMessageId: normalizeSmtpMessageId(sentResult.messageId),
                    fromEmail:
                        process.env.QUOTATION_MAIL_FROM_ADDRESS?.trim() ||
                        process.env.MAIL_FROM_ADDRESS?.trim() ||
                        null,
                },
            })
        } else {
            await this.prisma.crmEmailMessage.update({
                where: { id: message.id },
                data: {
                    status: 'FAILED',
                    lastError:
                        sentResult.error ??
                        sentResult.skippedReason ??
                        'Email not delivered',
                    updatedBy: userId,
                },
            })
        }

        return {
            ...this.view(await this.load(message.id)),
            delivery: sentResult,
        }
    }

    private async uploadBuffers(message: MessageRow): Promise<QuotationMailAttachment[]> {
        const out: QuotationMailAttachment[] = []
        for (const attachment of message.attachments) {
            if (attachment.kind !== 'UPLOAD' || !attachment.storageKey) continue
            const content = storage.readBuffer(attachment.storageKey)
            if (!content) continue
            out.push({
                filename: attachment.fileName,
                content,
                contentType: attachment.mimeType ?? undefined,
            })
        }
        return out
    }

    private async resolveLinks(input: {
        customerId?: string | null
        opportunityId?: string | null
        quotationId?: string | null
    }) {
        let customerId = input.customerId || null
        let opportunityId = input.opportunityId || null
        let quotationId = input.quotationId || null
        let quotationRevision: number | null = null

        if (quotationId) {
            const quote = await this.prisma.sdQuotation.findUnique({
                where: { id: quotationId },
                select: {
                    id: true,
                    revision: true,
                    customerId: true,
                    crmOpportunityId: true,
                    status: true,
                },
            })
            if (!quote) throw new NotFoundException('Quotation not found.')
            quotationRevision = quote.revision
            customerId = quote.customerId
            opportunityId = quote.crmOpportunityId
        } else if (opportunityId) {
            const opp = await this.prisma.crmOpportunity.findUnique({
                where: { id: opportunityId },
                select: { id: true, customerId: true },
            })
            if (!opp) throw new NotFoundException('Opportunity not found.')
            customerId = customerId || opp.customerId
        } else if (customerId) {
            const customer = await this.prisma.sdCustomer.findUnique({
                where: { id: customerId },
                select: { id: true },
            })
            if (!customer) throw new NotFoundException('Customer not found.')
        }

        return { customerId, opportunityId, quotationId, quotationRevision }
    }

    private async syncQuotationPdfAttachment(
        messageId: string,
        links: { quotationId: string | null; quotationRevision: number | null },
    ) {
        await this.prisma.crmEmailAttachment.deleteMany({
            where: { messageId, kind: 'QUOTATION_PDF' },
        })
        if (!links.quotationId || links.quotationRevision == null) return

        const document = await this.prisma.sdQuotationDocument.findUnique({
            where: {
                quotationId_revision: {
                    quotationId: links.quotationId,
                    revision: links.quotationRevision,
                },
            },
        })
        if (!document) return

        await this.prisma.crmEmailAttachment.create({
            data: {
                messageId,
                kind: 'QUOTATION_PDF',
                fileName: quotationDocumentFilename(
                    (
                        await this.prisma.sdQuotation.findUniqueOrThrow({
                            where: { id: links.quotationId },
                            select: { quotationNumber: true },
                        })
                    ).quotationNumber,
                    links.quotationRevision,
                ),
                mimeType: document.contentType,
                byteSize: document.byteSize,
                storageKey: null,
                quotationDocumentId: document.id,
            },
        })
    }

    private async load(id: string): Promise<MessageRow> {
        const row = await this.prisma.crmEmailMessage.findUnique({
            where: { id },
            include: MESSAGE_INCLUDE,
        })
        if (!row) throw new NotFoundException('Email not found.')
        return row
    }

    private view(row: MessageRow) {
        return {
            id: row.id,
            direction: row.direction,
            status: row.status,
            toEmail: row.toEmail,
            toName: row.toName,
            fromEmail: row.fromEmail,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
            customerId: row.customerId,
            customer: row.customer,
            opportunityId: row.opportunityId,
            opportunity: row.opportunity,
            quotationId: row.quotationId,
            quotationRevision: row.quotationRevision,
            quotation: row.quotation,
            templateKey: row.templateKey,
            starred: row.starred,
            isSpam: row.isSpam,
            provider: row.provider,
            receivedAt: row.receivedAt,
            sentAt: row.sentAt,
            lastError: row.lastError,
            createdBy: row.createdBy,
            updatedBy: row.updatedBy,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            attachments: row.attachments.map((a) => ({
                id: a.id,
                kind: a.kind,
                fileName: a.fileName,
                mimeType: a.mimeType,
                byteSize: a.byteSize,
                quotationDocumentId: a.quotationDocumentId,
                createdAt: a.createdAt,
            })),
        }
    }
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function normalizeSmtpMessageId(value?: string | null): string | null {
    if (!value) return null
    return value.trim().replace(/^<|>$/g, '') || null
}
