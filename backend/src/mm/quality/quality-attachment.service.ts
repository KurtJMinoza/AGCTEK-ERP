import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    buildQualityStorageKey,
    deleteQualityAttachmentFile,
    saveQualityAttachmentFile,
} from './quality-document-storage'

@Injectable()
export class QualityAttachmentService {
    constructor(private prisma: PrismaService) {}

    async list(entityType: string, entityId: string) {
        return this.prisma.mmQualityAttachment.findMany({
            where: { entityType, entityId },
            orderBy: { createdAt: 'desc' },
        })
    }

    async save(params: {
        companyId: string
        entityType: string
        entityId: string
        fileName: string
        buffer: Buffer
        mimeType?: string
        uploadedBy?: string
    }) {
        const storageKey = buildQualityStorageKey(
            params.entityType,
            params.entityId,
            params.fileName,
        )
        saveQualityAttachmentFile(storageKey, params.buffer)
        return this.prisma.mmQualityAttachment.create({
            data: {
                companyId: params.companyId,
                entityType: params.entityType,
                entityId: params.entityId,
                fileName: params.fileName,
                storageKey,
                mimeType: params.mimeType ?? null,
                fileSize: params.buffer.length,
                uploadedBy: params.uploadedBy ?? null,
            },
        })
    }

    async remove(id: string) {
        const row = await this.prisma.mmQualityAttachment.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Attachment not found')
        deleteQualityAttachmentFile(row.storageKey)
        await this.prisma.mmQualityAttachment.delete({ where: { id } })
        return { ok: true }
    }
}
