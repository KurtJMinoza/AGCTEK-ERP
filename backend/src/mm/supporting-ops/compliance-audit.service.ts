import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type ComplianceAuditInput = {
    companyId: string
    domain: string
    action: string
    entityType?: string
    entityId?: string
    entityNumber?: string
    performedBy?: string
    performedByRole?: string
    previousValue?: string
    newValue?: string
    reason?: string
    metadata?: Record<string, unknown>
}

@Injectable()
export class ComplianceAuditService {
    constructor(private prisma: PrismaService) {}

    /** Append-only — no update or delete APIs. */
    async record(input: ComplianceAuditInput) {
        return this.prisma.mmComplianceAuditEntry.create({
            data: {
                companyId: input.companyId,
                domain: input.domain,
                action: input.action,
                entityType: input.entityType ?? null,
                entityId: input.entityId ?? null,
                entityNumber: input.entityNumber ?? null,
                performedBy: input.performedBy ?? null,
                performedByRole: input.performedByRole ?? null,
                previousValue: input.previousValue ?? null,
                newValue: input.newValue ?? null,
                reason: input.reason ?? null,
                metadata: input.metadata as any,
            },
        })
    }

    async list(query: {
        companyId: string
        domain?: string
        entityType?: string
        entityId?: string
        page?: number
        pageSize?: number
    }) {
        const where: any = { companyId: query.companyId }
        if (query.domain) where.domain = query.domain
        if (query.entityType) where.entityType = query.entityType
        if (query.entityId) where.entityId = query.entityId
        const page = query.page ?? 1
        const pageSize = Math.min(query.pageSize ?? 50, 200)
        const [data, total] = await Promise.all([
            this.prisma.mmComplianceAuditEntry.findMany({
                where,
                orderBy: { performedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmComplianceAuditEntry.count({ where }),
        ])
        return { data, total, page, pageSize }
    }
}
