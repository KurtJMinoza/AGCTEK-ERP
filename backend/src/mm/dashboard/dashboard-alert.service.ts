import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DashboardAlert, DashboardFilters } from './dashboard.helpers'

export type AlertScope =
    | 'inventory'
    | 'procurement'
    | 'warehouse'
    | 'suppliers'
    | 'finance'

export type ScopedDashboardAlert = DashboardAlert & { scope: AlertScope }

@Injectable()
export class DashboardAlertService {
    constructor(private prisma: PrismaService) {}

    async getAlerts(filters: DashboardFilters): Promise<ScopedDashboardAlert[]> {
        const [
            lowStock,
            stockoutRisk,
            overduePos,
            receivingVariance,
            blockedStock,
            countVariance,
            supplierIssue,
        ] = await Promise.all([
            this.belowReorderPoint(filters),
            this.projectedStockouts(filters),
            this.overduePos(filters),
            this.receivingVariance(filters),
            this.blockedStock(filters),
            this.inventoryDiscrepancy(filters),
            this.supplierQualityIssues(filters),
        ])

        const alerts: ScopedDashboardAlert[] = []
        if (lowStock > 0) {
            alerts.push({
                type: 'LOW_STOCK',
                scope: 'inventory',
                severity: 'warning',
                title: 'Low Stock',
                count: lowStock,
                href: '/modules/mm/planning-mrp/reorder-point',
                query: { filter: 'below' },
            })
        }
        if (stockoutRisk > 0) {
            alerts.push({
                type: 'STOCKOUT_RISK',
                scope: 'inventory',
                severity: 'danger',
                title: 'Stockout Risk',
                count: stockoutRisk,
                href: '/modules/mm/planning-mrp/shortage-monitor',
            })
        }
        if (overduePos > 0) {
            alerts.push({
                type: 'OVERDUE_PO',
                scope: 'procurement',
                severity: 'warning',
                title: 'Overdue PO',
                count: overduePos,
                href: '/modules/mm/procurement/purchase-orders',
                query: { filter: 'overdue' },
            })
        }
        if (receivingVariance > 0) {
            alerts.push({
                type: 'RECEIVING_VARIANCE',
                scope: 'warehouse',
                severity: 'warning',
                title: 'Receiving Variance',
                count: receivingVariance,
                href: '/modules/mm/receiving/receiving-variances',
            })
        }
        if (blockedStock > 0) {
            alerts.push({
                type: 'BLOCKED_STOCK',
                scope: 'inventory',
                severity: 'warning',
                title: 'Blocked Stock',
                count: blockedStock,
                href: '/modules/mm/returns-disposal/damaged-stock',
                query: { stockStatus: 'BLOCKED' },
            })
        }
        if (countVariance > 0) {
            alerts.push({
                type: 'COUNT_VARIANCE',
                scope: 'inventory',
                severity: 'warning',
                title: 'Count Variance',
                count: countVariance,
                href: '/modules/mm/inventory-control/variance-analysis',
            })
        }
        if (supplierIssue > 0) {
            alerts.push({
                type: 'SUPPLIER_ISSUE',
                scope: 'suppliers',
                severity: 'warning',
                title: 'Supplier Issue',
                count: supplierIssue,
                href: '/modules/mm/supplier-management/supplier-performance',
            })
        }

        const expiryRisk = await this.expiryRisk(filters)
        if (expiryRisk > 0) {
            alerts.push({
                type: 'EXPIRY_RISK',
                scope: 'inventory',
                severity: 'warning',
                title: 'Expiry Risk',
                count: expiryRisk,
                href: '/modules/mm/returns-disposal/damaged-stock',
                query: { filter: 'expiry' },
            })
        }
        return alerts
    }

    filterByVisibility(
        alerts: ScopedDashboardAlert[],
        visibility: {
            inventory: boolean
            procurement: boolean
            warehouse: boolean
            analytics: boolean
        },
    ): DashboardAlert[] {
        return alerts.filter((a) => {
            switch (a.scope) {
                case 'inventory':
                    return visibility.inventory
                case 'procurement':
                    return visibility.procurement
                case 'warehouse':
                    return visibility.warehouse
                case 'suppliers':
                    return visibility.procurement
                case 'finance':
                    return visibility.inventory
                default:
                    return true
            }
        })
    }

    private async belowReorderPoint(filters: DashboardFilters): Promise<number> {
        const latest = await this.prisma.mmMrpRun.findFirst({
            where: { companyId: filters.companyId, status: 'COMPLETED' },
            orderBy: { executionTime: 'desc' },
            select: { id: true },
        })
        if (!latest) return 0
        return this.prisma.mmMaterialRequirement.count({
            where: {
                mrpRunId: latest.id,
                belowReorderPoint: true,
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
        })
    }

    private async projectedStockouts(filters: DashboardFilters): Promise<number> {
        const latest = await this.prisma.mmMrpRun.findFirst({
            where: { companyId: filters.companyId, status: 'COMPLETED' },
            orderBy: { executionTime: 'desc' },
            select: { id: true },
        })
        if (!latest) return 0
        return this.prisma.mmMaterialRequirement.count({
            where: {
                mrpRunId: latest.id,
                projectedStockoutDate: { not: null },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
        })
    }

    private async overduePos(filters: DashboardFilters): Promise<number> {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return this.prisma.mmPurchaseOrder.count({
            where: {
                companyId: filters.companyId,
                status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] },
                expectedDeliveryDate: { lt: today },
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
        })
    }

    private async receivingVariance(filters: DashboardFilters): Promise<number> {
        return this.prisma.mmGoodsReceiptLine.count({
            where: {
                discrepancyFlag: { not: null },
                receipt: {
                    companyId: filters.companyId,
                    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
                    ...(filters.dateFrom || filters.dateTo
                        ? {
                              postingDate: {
                                  ...(filters.dateFrom
                                      ? { gte: new Date(filters.dateFrom) }
                                      : {}),
                                  ...(filters.dateTo
                                      ? { lte: new Date(filters.dateTo) }
                                      : {}),
                              },
                          }
                        : {}),
                },
            },
        })
    }

    private async blockedStock(filters: DashboardFilters): Promise<number> {
        const rows = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId'],
            where: {
                companyId: filters.companyId,
                stockStatus: 'BLOCKED',
                quantity: { gt: 0 },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            _sum: { quantity: true },
        })
        return rows.length
    }

    private async supplierQualityIssues(filters: DashboardFilters): Promise<number> {
        return this.prisma.mmSupplierAlert.count({
            where: {
                companyId: filters.companyId,
                status: 'OPEN',
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            },
        })
    }

    private async inventoryDiscrepancy(filters: DashboardFilters): Promise<number> {
        return this.prisma.mmInventoryCountLine.count({
            where: {
                OR: [
                    { status: 'REQUIRE_RECOUNT' },
                    { varianceQuantity: { not: 0 } },
                ],
                count: {
                    companyId: filters.companyId,
                    status: { in: ['COUNTING', 'RECOUNT', 'APPROVAL'] },
                    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
                },
            },
        })
    }

    private async expiryRisk(filters: DashboardFilters, horizonDays = 30): Promise<number> {
        const horizon = new Date(Date.now() + horizonDays * 86400000)
        return this.prisma.mmInventoryBalance.count({
            where: {
                companyId: filters.companyId,
                quantity: { gt: 0 },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
                OR: [
                    { stockStatus: 'EXPIRED' },
                    { batch: { expiryDate: { lte: horizon } } },
                ],
            },
        })
    }
}
