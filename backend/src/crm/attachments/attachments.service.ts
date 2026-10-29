import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common'
import type { CrmAttachment } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    createDocumentStorage,
    DOCUMENT_MAX_BYTES,
    sanitizeDocumentFileName,
    UnsupportedDocumentTypeError,
} from '../../common/document-storage'
import { CRM_USER_SUMMARY_SELECT } from '../crm-references'
import { CrmMessagesService } from '../messages/crm-messages.service'
import type { UploadCrmAttachmentDto } from './dto/attachment.dto'

export type AttachmentParent = { kind: 'ticket' | 'opportunity'; id: string }

const TERMINAL_TICKET_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'CANCELLED'])

const storage = createDocumentStorage('crm', 'attachments')

const parentColumn = (parent: AttachmentParent) =>
    parent.kind === 'ticket' ? { ticketId: parent.id } : { opportunityId: parent.id }

/**
 * Supporting documents on tickets and opportunities (document control): every upload is a new row,
 * re-uploading a file name adds the next version, removal is a soft delete, and both are audited on
 * the parent's SYSTEM trail. Files stay on disk after removal.
 */
@Injectable()
export class CrmAttachmentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly messages: CrmMessagesService,
    ) {}

    /** Current (not removed) attachments, newest first, with the uploader's display name. */
    async list(parent: AttachmentParent) {
        await this.findParent(parent)
        const rows = await this.prisma.crmAttachment.findMany({
            where: { ...parentColumn(parent), deletedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
        return this.present(rows)
    }

    async upload(parent: AttachmentParent, dto: UploadCrmAttachmentDto, userId: string) {
        const { open, label } = await this.findParent(parent)
        if (!open) throw new ConflictException(`Cannot attach files to a ${label}`)
        const buffer = Buffer.from(dto.contentBase64, 'base64')
        if (buffer.length === 0) throw new BadRequestException('The file is empty')
        if (buffer.length > DOCUMENT_MAX_BYTES) {
            throw new PayloadTooLargeException('Attachments are limited to 10 MB')
        }
        const fileName = sanitizeDocumentFileName(dto.fileName)
        let storageKey: string
        try {
            storageKey = storage.buildKey(parent.kind, parent.id, fileName)
        } catch (error) {
            if (error instanceof UnsupportedDocumentTypeError) throw new BadRequestException(error.message)
            throw error
        }
        storage.save(storageKey, buffer)

        try {
            const row = await this.prisma.$transaction(async (tx) => {
                const previous = await tx.crmAttachment.aggregate({
                    where: { ...parentColumn(parent), fileName },
                    _max: { version: true },
                })
                const version = (previous._max.version ?? 0) + 1
                const created = await tx.crmAttachment.create({
                    data: {
                        ...parentColumn(parent),
                        fileName,
                        version,
                        storageKey,
                        mimeType: dto.mimeType ?? null,
                        fileSize: buffer.length,
                        uploadedBy: userId,
                    },
                })
                await this.audit(tx, parent, `Attached ${fileName}${version > 1 ? ` (version ${version})` : ''}`, created, userId)
                return created
            })
            return (await this.present([row]))[0]
        } catch (error) {
            storage.remove(storageKey)
            throw error
        }
    }

    /** The row and a stream of its file; only through the authenticated parent route. */
    async download(parent: AttachmentParent, attachmentId: string) {
        const row = await this.findAttachment(parent, attachmentId)
        if (row.deletedAt) throw new NotFoundException('Attachment was removed')
        try {
            return { row, stream: storage.read(row.storageKey) }
        } catch {
            throw new NotFoundException('Attachment file is missing on the server')
        }
    }

    /** Soft delete: hidden from the list, kept with who / when for document control. */
    async remove(parent: AttachmentParent, attachmentId: string, userId: string) {
        const row = await this.findAttachment(parent, attachmentId)
        if (row.deletedAt) return { id: row.id, removed: true }
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.crmAttachment.updateMany({
                where: { id: row.id, deletedAt: null },
                data: { deletedAt: new Date(), deletedBy: userId },
            })
            if (updated.count > 0) {
                await this.audit(tx, parent, `Removed attachment ${row.fileName} (version ${row.version})`, row, userId)
            }
        })
        return { id: row.id, removed: true }
    }

    private audit(
        tx: Parameters<CrmMessagesService['recordSystemOn']>[0],
        parent: AttachmentParent,
        summary: string,
        row: CrmAttachment,
        userId: string,
    ) {
        const change = { field: 'attachment', from: null, to: `${row.fileName} v${row.version}`, summary }
        return parent.kind === 'ticket'
            ? this.messages.recordSystemOn(tx, { ticketId: parent.id }, [change], userId)
            : this.messages.recordSystem(tx, parent.id, [change], userId)
    }

    private async findAttachment(parent: AttachmentParent, attachmentId: string) {
        await this.findParent(parent)
        const row = await this.prisma.crmAttachment.findFirst({
            where: { id: attachmentId, ...parentColumn(parent) },
        })
        if (!row) throw new NotFoundException('Attachment not found')
        return row
    }

    /** Closed / cancelled tickets are read-only; opportunities accept documents in every stage. */
    private async findParent(parent: AttachmentParent) {
        if (parent.kind === 'ticket') {
            const ticket = await this.prisma.crmTicket.findUnique({
                where: { id: parent.id },
                select: { status: true },
            })
            if (!ticket) throw new NotFoundException('Ticket not found')
            return {
                open: !TERMINAL_TICKET_STATUSES.has(ticket.status),
                label: `${ticket.status} ticket`,
            }
        }
        const opportunity = await this.prisma.crmOpportunity.findUnique({
            where: { id: parent.id },
            select: { id: true },
        })
        if (!opportunity) throw new NotFoundException('Opportunity not found')
        return { open: true, label: 'opportunity' }
    }

    private async present(rows: CrmAttachment[]) {
        const ids = [...new Set(rows.map((r) => r.uploadedBy).filter((id): id is string => !!id))]
        const users = ids.length
            ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: CRM_USER_SUMMARY_SELECT })
            : []
        const byId = new Map(users.map((u) => [u.id, u]))
        return rows.map(({ storageKey: _storageKey, ...row }) => ({
            ...row,
            uploader: row.uploadedBy ? (byId.get(row.uploadedBy) ?? null) : null,
        }))
    }
}
