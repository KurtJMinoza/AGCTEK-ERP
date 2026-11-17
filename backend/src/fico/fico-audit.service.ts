import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type FicoAuditInput = {
    companyId?: string | null
    actorId?: string | null
    action: string
    entityType: string
    entityId?: string | null
    previousValues?: Record<string, unknown> | null
    newValues?: Record<string, unknown> | null
    reason?: string | null
    metadata?: Record<string, unknown> | null
}

export type FicoAuditQuery = {
    companyId?: string
    action?: string
    entityType?: string
    entityId?: string
    actorId?: string
    dateFrom?: Date
    dateTo?: Date
    page?: number
    pageSize?: number
}

function json(value: Record<string, unknown> | null | undefined) {
    if (value === undefined || value === null) return undefined
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Append-only accounting audit trail. The database triggers reject every
 * UPDATE/DELETE, so this service intentionally exposes no mutation methods
 * beyond `log`.
 */
@Injectable()
export class FicoAuditService {
    constructor(private readonly prisma: PrismaService) {}

    /** Pass `tx` to commit the audit row in the caller's transaction. */
    async log(input: FicoAuditInput, tx?: Prisma.TransactionClient) {
        const client = tx ?? this.prisma
        return client.ficoAccountingAuditLog.create({
            data: {
                companyId: input.companyId ?? null,
                actorId: input.actorId ?? null,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId ?? null,
                previousValues: json(input.previousValues),
                newValues: json(input.newValues),
                reason: input.reason ?? null,
                metadata: json(input.metadata),
            },
        })
    }

    async list(query: FicoAuditQuery) {
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const where: Prisma.FicoAccountingAuditLogWhereInput = {
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.action ? { action: query.action } : {}),
            ...(query.entityType ? { entityType: query.entityType } : {}),
            ...(query.entityId ? { entityId: query.entityId } : {}),
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.dateFrom || query.dateTo
                ? {
                      createdAt: {
                          ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                          ...(query.dateTo ? { lte: query.dateTo } : {}),
                      },
                  }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoAccountingAuditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoAccountingAuditLog.count({ where }),
        ])

        return { items, total, page, pageSize }
    }

    async listForEntity(
        companyId: string,
        entityType: string,
        entityId: string,
    ) {
        return this.prisma.ficoAccountingAuditLog.findMany({
            where: { companyId, entityType, entityId },
            orderBy: { createdAt: 'desc' },
        })
    }
}
