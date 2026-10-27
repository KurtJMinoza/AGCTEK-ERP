import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ComplianceAuditService } from './compliance-audit.service'

@Injectable()
export class ScanOverrideService {
    constructor(
        private prisma: PrismaService,
        private complianceAudit: ComplianceAuditService,
    ) {}

    async create(input: {
        companyId: string
        warehouseId?: string
        businessProcess: string
        sourceDocumentType?: string
        sourceDocumentId?: string
        materialId?: string
        batchId?: string
        serialNumberId?: string
        reasonCode: string
        explanation: string
        requestedBy: string
        supervisorRequired?: boolean
    }) {
        if (!input.explanation?.trim()) {
            throw new BadRequestException('Written explanation is required for scan override')
        }
        const overrideNumber = await this.nextNumber()
        const row = await this.prisma.mmScanOverride.create({
            data: {
                overrideNumber,
                companyId: input.companyId,
                warehouseId: input.warehouseId ?? null,
                businessProcess: input.businessProcess,
                sourceDocumentType: input.sourceDocumentType ?? null,
                sourceDocumentId: input.sourceDocumentId ?? null,
                materialId: input.materialId ?? null,
                batchId: input.batchId ?? null,
                serialNumberId: input.serialNumberId ?? null,
                reasonCode: input.reasonCode,
                explanation: input.explanation.trim(),
                requestedBy: input.requestedBy,
                supervisorRequired: !!input.supervisorRequired,
                status: 'PENDING',
            },
        })
        await this.complianceAudit.record({
            companyId: input.companyId,
            domain: 'scan_override',
            action: 'OVERRIDE_REQUESTED',
            entityType: 'SCAN_OVERRIDE',
            entityId: row.id,
            entityNumber: overrideNumber,
            performedBy: input.requestedBy,
            reason: input.reasonCode,
            metadata: { businessProcess: input.businessProcess },
        })
        return row
    }

    async approve(id: string, approverId: string, opts?: { reject?: boolean }) {
        const row = await this.prisma.mmScanOverride.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Scan override not found')
        if (row.status !== 'PENDING') {
            throw new BadRequestException(`Override is ${row.status}`)
        }
        if (row.requestedBy === approverId) {
            throw new ForbiddenException(
                'Requester cannot approve their own scan override when separation of duties applies',
            )
        }
        if (opts?.reject) {
            const updated = await this.prisma.mmScanOverride.update({
                where: { id },
                data: { status: 'REJECTED', rejectedAt: new Date() },
            })
            await this.complianceAudit.record({
                companyId: row.companyId,
                domain: 'scan_override',
                action: 'OVERRIDE_REJECTED',
                entityType: 'SCAN_OVERRIDE',
                entityId: row.id,
                entityNumber: row.overrideNumber,
                performedBy: approverId,
            })
            return updated
        }
        const updated = await this.prisma.mmScanOverride.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approvedBy: approverId,
                approvedAt: new Date(),
            },
        })
        await this.complianceAudit.record({
            companyId: row.companyId,
            domain: 'scan_override',
            action: 'OVERRIDE_APPROVED',
            entityType: 'SCAN_OVERRIDE',
            entityId: row.id,
            entityNumber: row.overrideNumber,
            performedBy: approverId,
        })
        return updated
    }

    async assertApprovedForUse(id: string, userId: string) {
        const row = await this.prisma.mmScanOverride.findUnique({ where: { id } })
        if (!row || row.status !== 'APPROVED') {
            throw new BadRequestException('Valid approved scan override is required')
        }
        await this.prisma.mmScanOverride.update({
            where: { id },
            data: { status: 'USED' },
        })
        await this.complianceAudit.record({
            companyId: row.companyId,
            domain: 'scan_override',
            action: 'OVERRIDE_USED',
            entityType: 'SCAN_OVERRIDE',
            entityId: row.id,
            entityNumber: row.overrideNumber,
            performedBy: userId,
        })
        return row
    }

    async list(query: {
        companyId: string
        status?: string
        page?: number
        pageSize?: number
    }) {
        const where: any = { companyId: query.companyId }
        if (query.status) where.status = query.status
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmScanOverride.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmScanOverride.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    private async nextNumber() {
        const count = await this.prisma.mmScanOverride.count()
        const year = new Date().getFullYear()
        return `OVR-${year}-${String(count + 1).padStart(6, '0')}`
    }
}
