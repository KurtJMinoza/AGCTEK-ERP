import { ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DashboardFilters, resolveVisibility } from '../dashboard/dashboard.helpers'

export const MAX_REPORT_LIMIT = 200

export type ReportFamily = 'inventory' | 'procurement' | 'warehouse' | 'analytics'

export type Visibility = ReturnType<typeof resolveVisibility>

export function clampLimit(limit?: number): number {
    const n = limit ?? 50
    return Math.min(Math.max(1, n), MAX_REPORT_LIMIT)
}

export function assertReportAccess(family: ReportFamily, visibility: Visibility): void {
    const allowed =
        family === 'analytics'
            ? visibility.analytics
            : visibility[family]
    if (!allowed) {
        throw new ForbiddenException(`Report access denied for ${family}`)
    }
}

export async function resolveWarehouseIds(
    prisma: PrismaService,
    filters: Pick<DashboardFilters, 'companyId' | 'warehouseId' | 'branchId'>,
): Promise<string[] | null> {
    if (filters.warehouseId) return [filters.warehouseId]
    if (!filters.branchId) return null
    const rows = await prisma.warehouse.findMany({
        where: {
            companyId: filters.companyId,
            branchId: filters.branchId,
            deletedAt: null,
        },
        select: { id: true },
    })
    return rows.map((r) => r.id)
}

export function toDashboardFilters(
    q: DashboardFilters & { agingBuckets?: string },
): DashboardFilters {
    return {
        companyId: q.companyId,
        warehouseId: q.warehouseId,
        branchId: q.branchId,
        materialCategoryId: q.materialCategoryId,
        supplierId: q.supplierId,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        deadStockDays: q.deadStockDays,
        agingBuckets: q.agingBuckets,
    }
}
