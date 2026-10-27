import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ComplianceAuditService } from './compliance-audit.service'

@Injectable()
export class BarcodeRegistryService {
    constructor(
        private prisma: PrismaService,
        private complianceAudit: ComplianceAuditService,
    ) {}

    async list(query: {
        companyId?: string
        materialId?: string
        entityType?: string
        status?: string
        search?: string
        page?: number
        pageSize?: number
    }) {
        const where: any = { deletedAt: null }
        if (query.companyId) where.companyId = query.companyId
        if (query.materialId) where.materialId = query.materialId
        if (query.entityType) where.entityType = query.entityType
        if (query.status) where.status = query.status
        else where.status = 'ACTIVE'
        if (query.search) {
            where.OR = [
                { barcodeValue: { contains: query.search, mode: 'insensitive' } },
                { material: { materialCode: { contains: query.search, mode: 'insensitive' } } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmBarcode.findMany({
                where,
                include: {
                    material: {
                        select: { id: true, materialCode: true, materialName: true, companyId: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmBarcode.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async create(input: {
        materialId: string
        barcodeType: string
        barcodeValue: string
        isPrimary?: boolean
        entityType?: string
        entityId?: string
        uomId?: string
        packagingQuantity?: number
        batchId?: string
        serialNumberId?: string
        effectiveFrom?: string
        effectiveTo?: string
        createdBy?: string
    }) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: input.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')
        if (!material.companyId) {
            throw new BadRequestException('Material must belong to a company')
        }
        const companyId = material.companyId

        const dup = await this.prisma.mmBarcode.findFirst({
            where: {
                companyId,
                barcodeValue: input.barcodeValue,
                deletedAt: null,
                archivedAt: null,
                status: 'ACTIVE',
            },
        })
        if (dup) throw new ConflictException('Barcode value already exists for this company')

        if (input.batchId) {
            const batch = await this.prisma.mmBatch.findFirst({
                where: { id: input.batchId, materialId: input.materialId },
            })
            if (!batch) throw new BadRequestException('Invalid batch for material')
        }

        const isPrimary = Boolean(input.isPrimary)
        if (isPrimary) {
            await this.prisma.mmBarcode.updateMany({
                where: {
                    materialId: input.materialId,
                    deletedAt: null,
                    isPrimary: true,
                    status: 'ACTIVE',
                },
                data: { isPrimary: false },
            })
        }

        const row = await this.prisma.mmBarcode.create({
            data: {
                companyId,
                materialId: input.materialId,
                entityType: input.entityType ?? 'MATERIAL',
                entityId: input.entityId ?? input.materialId,
                barcodeType: input.barcodeType,
                barcodeValue: input.barcodeValue.trim(),
                uomId: input.uomId ?? null,
                packagingQuantity:
                    input.packagingQuantity != null
                        ? new Decimal(input.packagingQuantity)
                        : null,
                batchId: input.batchId ?? null,
                serialNumberId: input.serialNumberId ?? null,
                isPrimary,
                status: 'ACTIVE',
                effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
                effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
                createdBy: input.createdBy ?? null,
            },
            include: {
                material: { select: { id: true, materialCode: true, materialName: true } },
            },
        })

        await this.complianceAudit.record({
            companyId,
            domain: 'barcode_registry',
            action: 'BARCODE_REGISTERED',
            entityType: 'BARCODE',
            entityId: row.id,
            entityNumber: row.barcodeValue,
            performedBy: input.createdBy,
        })
        return row
    }

    async archive(id: string, performedBy?: string) {
        const row = await this.prisma.mmBarcode.findFirst({
            where: { id, deletedAt: null },
        })
        if (!row) throw new NotFoundException('Barcode not found')
        const updated = await this.prisma.mmBarcode.update({
            where: { id },
            data: { status: 'ARCHIVED', archivedAt: new Date(), isPrimary: false },
        })
        if (row.companyId) {
            await this.complianceAudit.record({
                companyId: row.companyId,
                domain: 'barcode_registry',
                action: 'BARCODE_ARCHIVED',
                entityType: 'BARCODE',
                entityId: id,
                entityNumber: row.barcodeValue,
                performedBy,
            })
        }
        return updated
    }

    /** Reject archived / out-of-effect barcodes at scan time. */
    async assertScannable(barcodeValue: string, companyId?: string) {
        const where: any = {
            barcodeValue,
            deletedAt: null,
            status: 'ACTIVE',
            archivedAt: null,
        }
        if (companyId) where.companyId = companyId
        const row = await this.prisma.mmBarcode.findFirst({ where })
        if (!row) return null
        const now = new Date()
        if (row.effectiveFrom && now < row.effectiveFrom) {
            throw new BadRequestException('Barcode is not yet effective')
        }
        if (row.effectiveTo && now > row.effectiveTo) {
            throw new BadRequestException('Barcode has expired')
        }
        return row
    }
}
