import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ComplianceAuditService } from './compliance-audit.service'
import {
    buildControlledDocStorageKey,
    saveControlledDocumentFile,
    sha256,
} from './controlled-document-storage'

@Injectable()
export class ControlledDocumentService {
    constructor(
        private prisma: PrismaService,
        private complianceAudit: ComplianceAuditService,
    ) {}

    async list(query: { companyId: string; status?: string; page?: number; pageSize?: number }) {
        const where: any = { companyId: query.companyId, archivedAt: null }
        if (query.status) where.status = query.status
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmControlledDocument.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmControlledDocument.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async create(input: {
        companyId: string
        title: string
        documentType: string
        department?: string
        processArea?: string
        ownerUserId?: string
        createdBy?: string
    }) {
        const documentNumber = await this.nextDocNumber()
        const doc = await this.prisma.mmControlledDocument.create({
            data: {
                documentNumber,
                title: input.title,
                documentType: input.documentType,
                companyId: input.companyId,
                department: input.department ?? null,
                processArea: input.processArea ?? null,
                ownerUserId: input.ownerUserId ?? null,
                status: 'DRAFT',
                createdBy: input.createdBy ?? null,
            },
        })
        await this.complianceAudit.record({
            companyId: input.companyId,
            domain: 'controlled_document',
            action: 'DOCUMENT_CREATED',
            entityType: 'CONTROLLED_DOCUMENT',
            entityId: doc.id,
            entityNumber: documentNumber,
            performedBy: input.createdBy,
        })
        return doc
    }

    async addVersion(input: {
        documentId: string
        revisionNumber: string
        fileName: string
        buffer: Buffer
        mimeType?: string
        changeSummary?: string
        authorUserId?: string
    }) {
        const doc = await this.prisma.mmControlledDocument.findUnique({
            where: { id: input.documentId },
        })
        if (!doc) throw new NotFoundException('Document not found')
        if (['EFFECTIVE', 'ARCHIVED'].includes(doc.status)) {
            throw new BadRequestException(
                'Create a new revision workflow; effective documents cannot be overwritten',
            )
        }

        const existing = await this.prisma.mmControlledDocumentVersion.findUnique({
            where: {
                documentId_revisionNumber: {
                    documentId: input.documentId,
                    revisionNumber: input.revisionNumber,
                },
            },
        })
        if (existing && existing.status !== 'DRAFT') {
            throw new BadRequestException('Revision is locked')
        }

        const storageKey = buildControlledDocStorageKey(input.documentId, input.fileName)
        saveControlledDocumentFile(storageKey, input.buffer)
        const fileChecksum = sha256(input.buffer)

        const version = await this.prisma.mmControlledDocumentVersion.upsert({
            where: {
                documentId_revisionNumber: {
                    documentId: input.documentId,
                    revisionNumber: input.revisionNumber,
                },
            },
            create: {
                documentId: input.documentId,
                revisionNumber: input.revisionNumber,
                fileName: input.fileName,
                storageKey,
                mimeType: input.mimeType ?? null,
                fileSize: input.buffer.length,
                fileChecksum,
                changeSummary: input.changeSummary ?? null,
                authorUserId: input.authorUserId ?? null,
                status: 'DRAFT',
            },
            update: {
                fileName: input.fileName,
                storageKey,
                mimeType: input.mimeType ?? null,
                fileSize: input.buffer.length,
                fileChecksum,
                changeSummary: input.changeSummary ?? null,
            },
        })

        await this.prisma.mmControlledDocument.update({
            where: { id: input.documentId },
            data: { currentRevision: input.revisionNumber },
        })

        await this.complianceAudit.record({
            companyId: doc.companyId,
            domain: 'controlled_document',
            action: 'VERSION_UPLOADED',
            entityType: 'CONTROLLED_DOCUMENT_VERSION',
            entityId: version.id,
            entityNumber: `${doc.documentNumber} rev ${input.revisionNumber}`,
            performedBy: input.authorUserId,
            metadata: { fileChecksum },
        })
        return version
    }

    async submitForReview(documentId: string, userId: string) {
        const doc = await this.findDoc(documentId)
        await this.prisma.mmControlledDocument.update({
            where: { id: documentId },
            data: { status: 'UNDER_REVIEW' },
        })
        await this.complianceAudit.record({
            companyId: doc.companyId,
            domain: 'controlled_document',
            action: 'SUBMITTED_FOR_REVIEW',
            entityType: 'CONTROLLED_DOCUMENT',
            entityId: documentId,
            entityNumber: doc.documentNumber,
            performedBy: userId,
        })
        return this.getOne(documentId)
    }

    async approveVersion(input: {
        documentId: string
        revisionNumber: string
        approverUserId: string
        authorUserId?: string
        effectiveDate?: string
    }) {
        const doc = await this.findDoc(input.documentId)
        if (input.authorUserId && input.authorUserId === input.approverUserId) {
            throw new ForbiddenException(
                'Document author cannot approve their own controlled document',
            )
        }
        const version = await this.prisma.mmControlledDocumentVersion.findUnique({
            where: {
                documentId_revisionNumber: {
                    documentId: input.documentId,
                    revisionNumber: input.revisionNumber,
                },
            },
        })
        if (!version) throw new NotFoundException('Revision not found')

        await this.prisma.mmControlledDocumentVersion.updateMany({
            where: {
                documentId: input.documentId,
                status: 'EFFECTIVE',
            },
            data: { status: 'SUPERSEDED', obsoleteDate: new Date() },
        })

        const effective = input.effectiveDate ? new Date(input.effectiveDate) : new Date()
        await this.prisma.mmControlledDocumentVersion.update({
            where: { id: version.id },
            data: {
                status: 'EFFECTIVE',
                approverUserId: input.approverUserId,
                approvedAt: new Date(),
                effectiveDate: effective,
            },
        })

        await this.prisma.mmControlledDocument.update({
            where: { id: input.documentId },
            data: {
                status: 'EFFECTIVE',
                approvedBy: input.approverUserId,
                effectiveDate: effective,
                currentRevision: input.revisionNumber,
            },
        })

        await this.complianceAudit.record({
            companyId: doc.companyId,
            domain: 'controlled_document',
            action: 'VERSION_EFFECTIVE',
            entityType: 'CONTROLLED_DOCUMENT',
            entityId: input.documentId,
            entityNumber: doc.documentNumber,
            performedBy: input.approverUserId,
            newValue: input.revisionNumber,
        })
        return this.getOne(input.documentId)
    }

    async getOne(id: string) {
        const doc = await this.prisma.mmControlledDocument.findUnique({
            where: { id },
            include: {
                versions: { orderBy: { revisionNumber: 'desc' } },
            },
        })
        if (!doc) throw new NotFoundException('Document not found')
        return doc
    }

    private async findDoc(id: string) {
        const doc = await this.prisma.mmControlledDocument.findUnique({ where: { id } })
        if (!doc) throw new NotFoundException('Document not found')
        return doc
    }

    private async nextDocNumber() {
        const count = await this.prisma.mmControlledDocument.count()
        const year = new Date().getFullYear()
        return `DOC-${year}-${String(count + 1).padStart(6, '0')}`
    }
}
