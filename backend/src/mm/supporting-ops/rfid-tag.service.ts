import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ComplianceAuditService } from './compliance-audit.service'

const READ_DEDUPE_MS = 5000

@Injectable()
export class RfidTagService {
    constructor(
        private prisma: PrismaService,
        private complianceAudit: ComplianceAuditService,
    ) {}

    async list(query: {
        companyId: string
        status?: string
        materialId?: string
        search?: string
        page?: number
        pageSize?: number
    }) {
        const where: any = { companyId: query.companyId, archivedAt: null }
        if (query.status) where.status = query.status
        if (query.materialId) where.materialId = query.materialId
        if (query.search) {
            where.tagValue = { contains: query.search, mode: 'insensitive' }
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmRfidTag.findMany({
                where,
                include: {
                    material: {
                        select: { id: true, materialCode: true, materialName: true },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmRfidTag.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async assign(input: {
        companyId: string
        tagValue: string
        entityType?: string
        entityId?: string
        materialId?: string
        batchId?: string
        serialNumberId?: string
        performedBy?: string
    }) {
        if (input.serialNumberId) {
            const other = await this.prisma.mmRfidTag.findFirst({
                where: {
                    serialNumberId: input.serialNumberId,
                    archivedAt: null,
                    status: { notIn: ['ARCHIVED', 'LOST'] },
                    NOT: {
                        AND: [
                            { companyId: input.companyId },
                            { tagValue: input.tagValue },
                        ],
                    },
                },
            })
            if (other) {
                throw new ConflictException(
                    'An active RFID tag is already assigned to this serial number',
                )
            }
        }

        const tag = await this.prisma.mmRfidTag.upsert({
            where: {
                companyId_tagValue: {
                    companyId: input.companyId,
                    tagValue: input.tagValue,
                },
            },
            create: {
                tagValue: input.tagValue,
                companyId: input.companyId,
                entityType: input.entityType ?? null,
                entityId: input.entityId ?? null,
                materialId: input.materialId ?? null,
                batchId: input.batchId ?? null,
                serialNumberId: input.serialNumberId ?? null,
                status: input.serialNumberId || input.materialId ? 'ASSIGNED' : 'UNASSIGNED',
                assignedAt: new Date(),
            },
            update: {
                entityType: input.entityType ?? undefined,
                entityId: input.entityId ?? undefined,
                materialId: input.materialId ?? undefined,
                batchId: input.batchId ?? undefined,
                serialNumberId: input.serialNumberId ?? undefined,
                status: 'ASSIGNED',
                assignedAt: new Date(),
            },
        })

        await this.complianceAudit.record({
            companyId: input.companyId,
            domain: 'rfid',
            action: 'TAG_ASSIGNED',
            entityType: 'RFID_TAG',
            entityId: tag.id,
            entityNumber: tag.tagValue,
            performedBy: input.performedBy,
        })
        return tag
    }

    /**
     * Record a reader event — does not post inventory.
     * Deduplicates reads within READ_DEDUPE_MS.
     */
    async recordRead(input: {
        companyId: string
        tagValue: string
        readerId?: string
        warehouseId?: string
        storageBinId?: string
        performedBy?: string
    }) {
        const tag = await this.prisma.mmRfidTag.findUnique({
            where: {
                companyId_tagValue: {
                    companyId: input.companyId,
                    tagValue: input.tagValue,
                },
            },
        })
        if (!tag || tag.archivedAt) {
            throw new NotFoundException('RFID tag not registered')
        }
        const now = new Date()
        if (
            tag.lastReadAt &&
            now.getTime() - tag.lastReadAt.getTime() < READ_DEDUPE_MS &&
            tag.lastReaderId === (input.readerId ?? null)
        ) {
            return { tag, duplicateRead: true }
        }
        const updated = await this.prisma.mmRfidTag.update({
            where: { id: tag.id },
            data: {
                lastReadAt: now,
                lastReaderId: input.readerId ?? null,
                lastWarehouseId: input.warehouseId ?? tag.lastWarehouseId,
                lastStorageBinId: input.storageBinId ?? tag.lastStorageBinId,
                status: tag.status === 'UNASSIGNED' ? tag.status : 'ACTIVE',
            },
        })
        await this.complianceAudit.record({
            companyId: input.companyId,
            domain: 'rfid',
            action: 'TAG_READ',
            entityType: 'RFID_TAG',
            entityId: tag.id,
            entityNumber: tag.tagValue,
            performedBy: input.performedBy,
            metadata: {
                readerId: input.readerId,
                warehouseId: input.warehouseId,
            },
        })
        return { tag: updated, duplicateRead: false }
    }

    async archive(id: string, companyId: string, performedBy?: string) {
        const tag = await this.prisma.mmRfidTag.findFirst({
            where: { id, companyId },
        })
        if (!tag) throw new NotFoundException('RFID tag not found')
        const updated = await this.prisma.mmRfidTag.update({
            where: { id },
            data: { status: 'ARCHIVED', archivedAt: new Date(), serialNumberId: null },
        })
        await this.complianceAudit.record({
            companyId,
            domain: 'rfid',
            action: 'TAG_ARCHIVED',
            entityType: 'RFID_TAG',
            entityId: id,
            entityNumber: tag.tagValue,
            performedBy,
        })
        return updated
    }
}
