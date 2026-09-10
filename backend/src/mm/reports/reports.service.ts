import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryBalanceQueryService } from '../inventory/inventory-balance-query.service'
import { InventoryValueService } from '../valuation/inventory-value.service'
import { DashboardAnalyticsService } from '../dashboard/dashboard-analytics.service'
import { DashboardVisibilityService } from '../dashboard/dashboard-visibility.service'
import { SupplierPerformanceDashboardService } from '../supplier-performance/supplier-performance-dashboard.service'
import { StockVarianceReportService } from './stock-variance-report.service'
import { WarehousePerformanceReportService } from './warehouse-performance-report.service'
import { ReportsQueryDto } from './dto/reports.dto'
import {
    assertReportAccess,
    clampLimit,
    resolveWarehouseIds,
    toDashboardFilters,
} from './reports.helpers'

@Injectable()
export class ReportsService {
    constructor(
        private prisma: PrismaService,
        private balanceQuery: InventoryBalanceQueryService,
        private inventoryValue: InventoryValueService,
        private analytics: DashboardAnalyticsService,
        private supplierDashboard: SupplierPerformanceDashboardService,
        private varianceReport: StockVarianceReportService,
        private warehousePerf: WarehousePerformanceReportService,
        private visibilityService: DashboardVisibilityService,
    ) {}

    private visibility(query: ReportsQueryDto) {
        return this.visibilityService.getVisibility(query.role, query.authority)
    }

    async getStock(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('inventory', visibility)

        const page = query.page ?? 1
        const limit = clampLimit(query.limit)
        const warehouseIds = await resolveWarehouseIds(this.prisma, query)

        const where: any = {
            companyId: query.companyId,
            ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            ...(query.materialId ? { materialId: query.materialId } : {}),
            ...(query.storageBinId ? { storageBinId: query.storageBinId } : {}),
            ...(query.batchId ? { batchId: query.batchId } : {}),
            ...(query.serialNumberId
                ? { serialNumberId: query.serialNumberId }
                : {}),
            ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
            ...(query.materialCategoryId
                ? { material: { materialCategoryId: query.materialCategoryId } }
                : {}),
        }

        if (!query.groupBy) {
            const skip = (page - 1) * limit
            const [data, total, agg] = await Promise.all([
                this.prisma.mmInventoryBalance.findMany({
                    where,
                    include: {
                        company: true,
                        warehouse: true,
                        storageBin: true,
                        material: { include: { materialCategory: true } },
                        batch: true,
                        serialNumber: true,
                    },
                    orderBy: { updatedAt: 'desc' },
                    skip,
                    take: limit,
                }),
                this.prisma.mmInventoryBalance.count({ where }),
                this.prisma.mmInventoryBalance.aggregate({
                    where,
                    _sum: { quantity: true },
                }),
            ])

            return {
                type: 'STOCK',
                data,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit) || 1,
                },
                totals: { quantity: Number(agg._sum.quantity ?? 0) },
            }
        }

        return this.getGroupedStock(query, where, page, limit)
    }

    private async getGroupedStock(
        query: ReportsQueryDto,
        where: any,
        page: number,
        limit: number,
    ) {
        const balances = await this.prisma.mmInventoryBalance.findMany({
            where,
            include: {
                material: { include: { materialCategory: true } },
                warehouse: true,
                storageBin: true,
                batch: true,
                serialNumber: true,
            },
            take: 5000,
        })

        type Row = {
            key: string
            label: string
            quantity: number
            materialId?: string
            categoryId?: string
            warehouseId?: string
            storageBinId?: string
            batchId?: string
            serialNumberId?: string
            stockStatus?: string
        }

        const map = new Map<string, Row>()

        for (const b of balances) {
            let key: string
            let label: string
            switch (query.groupBy) {
                case 'material':
                    key = b.materialId
                    label = `${b.material.materialCode} — ${b.material.materialName}`
                    break
                case 'category':
                    key = b.material.materialCategoryId ?? 'uncategorized'
                    label =
                        b.material.materialCategory?.name ?? 'Uncategorized'
                    break
                case 'warehouse':
                    key = b.warehouseId
                    label = b.warehouse.name
                    break
                case 'bin':
                    key = b.storageBinId ?? 'no-bin'
                    label = b.storageBin?.code ?? 'No bin'
                    break
                case 'batch':
                    key = b.batchId ?? 'no-batch'
                    label = b.batch?.batchNumber ?? 'No batch'
                    break
                case 'serial':
                    key = b.serialNumberId ?? 'no-serial'
                    label = b.serialNumber?.serialNumber ?? 'No serial'
                    break
                case 'status':
                    key = b.stockStatus
                    label = b.stockStatus
                    break
                default:
                    key = b.materialId
                    label = b.material.materialCode
            }

            const cur = map.get(key) ?? {
                key,
                label,
                quantity: 0,
                materialId:
                    query.groupBy === 'material' ? b.materialId : undefined,
                categoryId:
                    query.groupBy === 'category'
                        ? (b.material.materialCategoryId ?? undefined)
                        : undefined,
                warehouseId:
                    query.groupBy === 'warehouse' ? b.warehouseId : undefined,
                storageBinId:
                    query.groupBy === 'bin'
                        ? (b.storageBinId ?? undefined)
                        : undefined,
                batchId:
                    query.groupBy === 'batch' ? (b.batchId ?? undefined) : undefined,
                serialNumberId:
                    query.groupBy === 'serial'
                        ? (b.serialNumberId ?? undefined)
                        : undefined,
                stockStatus:
                    query.groupBy === 'status' ? b.stockStatus : undefined,
            }
            cur.quantity += Number(b.quantity)
            map.set(key, cur)
        }

        const all = Array.from(map.values()).sort(
            (a, b) => b.quantity - a.quantity,
        )
        const total = all.length
        const skip = (page - 1) * limit
        const data = all.slice(skip, skip + limit)
        const totalQty = all.reduce((s, r) => s + r.quantity, 0)

        return {
            type: 'STOCK',
            groupBy: query.groupBy,
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
            },
            totals: { quantity: totalQty },
        }
    }

    async getInventoryValuation(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('inventory', visibility)

        return this.inventoryValue.queryReadOnly({
            companyId: query.companyId,
            warehouseId: query.warehouseId,
            materialId: query.materialId,
            batchId: query.batchId,
            page: query.page,
            limit: clampLimit(query.limit),
        })
    }

    async getAging(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('analytics', visibility)
        return this.analytics.getAnalytics('aging', toDashboardFilters(query))
    }

    async getDeadStock(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('analytics', visibility)
        return this.analytics.getAnalytics('dead-stock', toDashboardFilters(query))
    }

    async getTurnover(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('analytics', visibility)
        return this.analytics.getAnalytics('turnover', toDashboardFilters(query))
    }

    async getProcurement(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('procurement', visibility)
        return this.analytics.getAnalytics('procurement', toDashboardFilters(query))
    }

    async getSupplierPerformance(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('procurement', visibility)
        return this.supplierDashboard.getDashboard({
            companyId: query.companyId,
            periodStart: query.dateFrom,
            periodEnd: query.dateTo,
        })
    }

    async getWarehousePerformance(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('warehouse', visibility)
        return this.warehousePerf.query(query)
    }

    async getStockVariance(query: ReportsQueryDto) {
        const visibility = this.visibility(query)
        assertReportAccess('inventory', visibility)
        return this.varianceReport.query(query)
    }
}
