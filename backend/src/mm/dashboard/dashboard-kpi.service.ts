import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    DashboardFilters,
    KpiCard,
    sumStockByStatus,
} from './dashboard.helpers'

function todayRange() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    return { start, end }
}

@Injectable()
export class DashboardKpiService {
    constructor(private prisma: PrismaService) {}

    private kpiCache = new Map<string, { expiresAt: number; value: any }>()
    private readonly KPI_TTL_MS = 45_000

    async getKpis(filters: DashboardFilters): Promise<{
        inventory: KpiCard[]
        procurement: KpiCard[]
        receiving: KpiCard[]
        warehouse: KpiCard[]
        control: KpiCard[]
        suppliers: KpiCard[]
    }> {
        const cacheKey = JSON.stringify({
            companyId: filters.companyId,
            warehouseId: filters.warehouseId ?? null,
            branchId: filters.branchId ?? null,
            materialCategoryId: filters.materialCategoryId ?? null,
            supplierId: filters.supplierId ?? null,
        })
        const hit = this.kpiCache.get(cacheKey)
        if (hit && hit.expiresAt > Date.now()) {
            return hit.value
        }
        const value = await this.computeKpis(filters)
        this.kpiCache.set(cacheKey, {
            expiresAt: Date.now() + this.KPI_TTL_MS,
            value,
        })
        return value
    }

    private async computeKpis(filters: DashboardFilters): Promise<{
        inventory: KpiCard[]
        procurement: KpiCard[]
        receiving: KpiCard[]
        warehouse: KpiCard[]
        control: KpiCard[]
        suppliers: KpiCard[]
    }> {
        const warehouseIds = await this.resolveWarehouseIds(filters)
        const wh = warehouseIds ? { warehouseId: { in: warehouseIds } } : {}
        const wmWh = warehouseIds
            ? { warehouseId: { in: warehouseIds } }
            : { warehouse: { companyId: filters.companyId } }
        const { start: todayStart, end: todayEnd } = todayRange()

        const [
            stockGroups,
            balanceAgg,
            inventoryValue,
            lowStock,
            outOfStock,
            openPrs,
            pendingPrApprovals,
            pendingPoApprovals,
            openRfqs,
            openPos,
            overduePos,
            expectedToday,
            receivingToday,
            inspectionPending,
            receivingVariances,
            openPutaway,
            openPicking,
            openPacking,
            transfersInTransit,
            countsDue,
            variancePending,
            recounts,
            adjustmentApprovals,
            supplierScore,
            lateDeliveries,
            qualityFailures,
            expiryRisk,
            openReceivingWorkload,
        ] = await Promise.all([
            this.stockByStatus(filters.companyId, warehouseIds),
            this.prisma.mmInventoryBalance.aggregate({
                where: {
                    companyId: filters.companyId,
                    quantity: { gt: 0 },
                    ...wh,
                    ...(filters.materialCategoryId
                        ? { material: { materialCategoryId: filters.materialCategoryId } }
                        : {}),
                },
                _sum: {
                    quantity: true,
                    reservedQuantity: true,
                    availableQuantity: true,
                },
            }),
            this.totalInventoryValue(
                filters.companyId,
                warehouseIds,
                filters.materialCategoryId,
            ),
            this.countLowStock(
                filters.companyId,
                warehouseIds,
                filters.materialCategoryId,
            ),
            this.countOutOfStock(
                filters.companyId,
                warehouseIds,
                filters.materialCategoryId,
            ),
            this.countDocs('mmPurchaseRequisition', {
                companyId: filters.companyId,
                status: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED'] },
                ...(filters.branchId ? { branchId: filters.branchId } : {}),
            }),
            this.countDocs('mmPurchaseRequisition', {
                companyId: filters.companyId,
                status: 'PENDING_APPROVAL',
            }),
            this.countDocs('mmPurchaseOrder', {
                companyId: filters.companyId,
                status: 'PENDING_APPROVAL',
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            }),
            this.countDocs('mmRfq', {
                companyId: filters.companyId,
                status: { notIn: ['CLOSED', 'CANCELLED'] },
            }),
            this.countDocs('mmPurchaseOrder', {
                companyId: filters.companyId,
                status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] },
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(warehouseIds
                    ? { OR: [{ warehouseId: { in: warehouseIds } }, { warehouseId: null }] }
                    : {}),
            }),
            this.countOverduePos(filters),
            this.countDocs('mmExpectedReceipt', {
                companyId: filters.companyId,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                expectedDate: { gte: todayStart, lte: todayEnd },
                ...wh,
            }),
            this.countDocs('mmGoodsReceipt', {
                companyId: filters.companyId,
                postingDate: { gte: todayStart, lte: todayEnd },
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                ...wh,
            }),
            this.countDocs('mmQualityInspection', {
                companyId: filters.companyId,
                status: 'PENDING',
                ...wh,
            }),
            this.countDocs('mmGoodsReceiptLine', {
                discrepancyFlag: { not: null },
                receipt: {
                    companyId: filters.companyId,
                    ...wh,
                },
            }),
            this.countDocs('wmPutawayTask', {
                ...(filters.companyId ? { companyId: filters.companyId } : {}),
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            }),
            this.countDocs('wmPickingTask', {
                status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PARTIALLY_PICKED'] },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            }),
            this.countDocs('wmPackage', {
                status: { in: ['OPEN', 'VERIFIED', 'PACKING'] },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            }),
            this.countTransfersInTransit(filters.companyId, warehouseIds),
            this.countDocs('mmInventoryCount', {
                companyId: filters.companyId,
                status: { in: ['OPEN', 'COUNTING'] },
                dueDate: { lte: todayEnd },
                ...wh,
            }),
            this.countDocs('mmInventoryCountLine', {
                status: { in: ['COUNTED', 'RECOUNTED'] },
                varianceQuantity: { not: 0 },
                count: {
                    companyId: filters.companyId,
                    status: 'APPROVAL',
                    ...wh,
                },
            }),
            this.countDocs('mmInventoryCountLine', {
                status: 'REQUIRE_RECOUNT',
                count: {
                    companyId: filters.companyId,
                    status: { in: ['COUNTING', 'RECOUNT'] },
                    ...wh,
                },
            }),
            this.countDocs('mmInventoryAdjustment', {
                companyId: filters.companyId,
                status: 'PENDING_APPROVAL',
                ...wh,
            }),
            this.avgSupplierScore(filters.companyId),
            this.countLateDeliveries(filters),
            this.countQualityFailures(filters),
            this.countExpiryRisk(filters.companyId, warehouseIds),
            this.countDocs('mmExpectedReceipt', {
                companyId: filters.companyId,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                ...wh,
            }),
        ])

        const stock = sumStockByStatus(stockGroups as any)
        const onHand = Number(balanceAgg._sum.quantity ?? 0)
        const reserved = Number(balanceAgg._sum.reservedQuantity ?? 0)
        const available = Number(balanceAgg._sum.availableQuantity ?? 0)

        return {
            inventory: [
                kpi(
                    'totalInventoryValue',
                    'Total Inventory Value',
                    inventoryValue,
                    'inventory',
                    '/modules/mm/reports-analytics/inventory-valuation-reports',
                    undefined,
                    true,
                ),
                kpi(
                    'onHand',
                    'On Hand',
                    onHand,
                    'inventory',
                    '/modules/mm/inventory-management/stock-overview',
                ),
                kpi(
                    'availableStock',
                    'Available',
                    available,
                    'inventory',
                    '/modules/mm/inventory-management/available-stock',
                    { stockStatus: 'UNRESTRICTED' },
                ),
                kpi(
                    'reservedStock',
                    'Reserved',
                    reserved,
                    'inventory',
                    '/modules/mm/inventory-management/reservations',
                    { status: 'OPEN' },
                ),
                kpi(
                    'qualityStock',
                    'Quality',
                    stock.quality,
                    'inventory',
                    '/modules/mm/receiving/quality-quarantine',
                    { stockStatus: 'QUALITY_INSPECTION' },
                ),
                kpi(
                    'blockedStock',
                    'Blocked',
                    stock.blocked,
                    'inventory',
                    '/modules/mm/returns-disposal/damaged-stock',
                    { stockStatus: 'BLOCKED' },
                ),
                kpi(
                    'lowStock',
                    'Low Stock',
                    lowStock,
                    'inventory',
                    '/modules/mm/planning-mrp/reorder-point',
                    { filter: 'below' },
                ),
                kpi(
                    'outOfStock',
                    'Out of Stock',
                    outOfStock,
                    'inventory',
                    '/modules/mm/planning-mrp/shortage-monitor',
                    { filter: 'stockout' },
                ),
                kpi(
                    'expiryRisk',
                    'Expiry Risk',
                    expiryRisk,
                    'inventory',
                    '/modules/mm/returns-disposal/damaged-stock',
                    { filter: 'expiry' },
                ),
            ],
            procurement: [
                kpi(
                    'openPrs',
                    'Open PR',
                    openPrs,
                    'procurement',
                    '/modules/mm/procurement/purchase-requisitions',
                ),
                kpi(
                    'pendingApprovals',
                    'Pending Approval',
                    pendingPrApprovals + pendingPoApprovals,
                    'procurement',
                    '/modules/mm/procurement/po-approvals',
                    { status: 'PENDING_APPROVAL' },
                ),
                kpi(
                    'openRfqs',
                    'Open RFQ',
                    openRfqs,
                    'procurement',
                    '/modules/mm/procurement/rfqs',
                ),
                kpi(
                    'openPos',
                    'Open PO',
                    openPos,
                    'procurement',
                    '/modules/mm/procurement/purchase-orders',
                    { status: 'SENT' },
                ),
                kpi(
                    'overduePos',
                    'Overdue PO',
                    overduePos,
                    'procurement',
                    '/modules/mm/procurement/purchase-orders',
                    { filter: 'overdue' },
                ),
            ],
            receiving: [
                kpi(
                    'expectedToday',
                    'Expected Today',
                    expectedToday,
                    'receiving',
                    '/modules/mm/receiving/expected-receipts',
                    { filter: 'today' },
                ),
                kpi(
                    'receivingToday',
                    'Receiving Today',
                    receivingToday,
                    'receiving',
                    '/modules/mm/receiving/goods-receipt',
                    { filter: 'today' },
                ),
                kpi(
                    'inspectionPending',
                    'Inspection Pending',
                    inspectionPending,
                    'receiving',
                    '/modules/mm/receiving/receiving-inspection',
                    { status: 'PENDING' },
                ),
                kpi(
                    'receivingVariances',
                    'Receiving Variances',
                    receivingVariances,
                    'receiving',
                    '/modules/mm/receiving/receiving-variances',
                ),
                kpi(
                    'openReceivingWorkload',
                    'Open Receiving',
                    openReceivingWorkload,
                    'receiving',
                    '/modules/mm/receiving/expected-receipts',
                    { status: 'OPEN' },
                ),
            ],
            warehouse: [
                kpi(
                    'openPutaway',
                    'Putaway Tasks',
                    openPutaway,
                    'warehouse',
                    '/modules/mm/warehouse-management/putaway',
                    { status: 'PENDING' },
                ),
                kpi(
                    'openPicking',
                    'Picking Tasks',
                    openPicking,
                    'warehouse',
                    '/modules/mm/warehouse-management/picking',
                    { status: 'OPEN' },
                ),
                kpi(
                    'openPacking',
                    'Packing Tasks',
                    openPacking,
                    'warehouse',
                    '/modules/mm/warehouse-management/packing',
                    { status: 'OPEN' },
                ),
                kpi(
                    'transfersInTransit',
                    'Transfers In Transit',
                    transfersInTransit,
                    'warehouse',
                    '/modules/mm/warehouse-management/warehouse-transfers',
                    { status: 'IN_TRANSIT' },
                ),
            ],
            control: [
                kpi(
                    'countsDue',
                    'Counts Due',
                    countsDue,
                    'control',
                    '/modules/mm/inventory-control/cycle-counting',
                    { filter: 'due' },
                ),
                kpi(
                    'variancePending',
                    'Variance Pending',
                    variancePending,
                    'control',
                    '/modules/mm/inventory-control/variance-analysis',
                    { status: 'APPROVAL' },
                ),
                kpi(
                    'recounts',
                    'Recounts',
                    recounts,
                    'control',
                    '/modules/mm/inventory-control/recounts',
                    { status: 'REQUIRE_RECOUNT' },
                ),
                kpi(
                    'adjustmentApprovals',
                    'Adjustment Approvals',
                    adjustmentApprovals,
                    'control',
                    '/modules/mm/inventory-control/adjustment-approval',
                    { status: 'PENDING_APPROVAL' },
                ),
            ],
            suppliers: [
                kpi(
                    'supplierScore',
                    'Supplier Score',
                    supplierScore,
                    'suppliers',
                    '/modules/mm/supplier-management/supplier-performance',
                ),
                kpi(
                    'lateDeliveries',
                    'Late Deliveries',
                    lateDeliveries,
                    'suppliers',
                    '/modules/mm/procurement/purchase-orders',
                    { filter: 'overdue' },
                ),
                kpi(
                    'qualityFailures',
                    'Quality Failures',
                    qualityFailures,
                    'suppliers',
                    '/modules/mm/receiving/receiving-inspection',
                    { result: 'FAIL' },
                ),
            ],
        }
    }

    private async resolveWarehouseIds(filters: DashboardFilters): Promise<string[] | null> {
        if (filters.warehouseId) return [filters.warehouseId]
        if (!filters.branchId) return null
        const rows = await this.prisma.warehouse.findMany({
            where: {
                companyId: filters.companyId,
                branchId: filters.branchId,
                deletedAt: null,
            },
            select: { id: true },
        })
        return rows.map((r) => r.id)
    }

    private async stockByStatus(companyId: string, warehouseIds: string[] | null) {
        return this.prisma.mmInventoryBalance.groupBy({
            by: ['stockStatus'],
            where: {
                companyId,
                quantity: { gt: 0 },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            },
            _sum: { quantity: true },
        })
    }

    private async totalInventoryValue(
        companyId: string,
        warehouseIds: string[] | null,
        materialCategoryId?: string,
    ): Promise<number> {
        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId,
                quantity: { gt: 0 },
                stockStatus: 'UNRESTRICTED',
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                ...(materialCategoryId
                    ? { material: { materialCategoryId } }
                    : {}),
            },
            select: { materialId: true, warehouseId: true, quantity: true },
            take: 5000,
        })
        if (!balances.length) return 0

        const valuations = await this.prisma.mmMaterialValuation.findMany({
            where: {
                companyId,
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
            },
            select: {
                materialId: true,
                warehouseId: true,
                movingAverageCost: true,
                standardCost: true,
                valuationMethod: true,
            },
        })
        const valMap = new Map(
            valuations.map((v) => [
                `${v.materialId}:${v.warehouseId}`,
                v.valuationMethod === 'STANDARD_COST'
                    ? Number(v.standardCost)
                    : Number(v.movingAverageCost),
            ]),
        )

        let total = 0
        for (const b of balances) {
            const unit = valMap.get(`${b.materialId}:${b.warehouseId}`) ?? 0
            total += Number(b.quantity) * unit
        }
        return Number(total.toFixed(2))
    }

    private async countLowStock(
        companyId: string,
        warehouseIds: string[] | null,
        materialCategoryId?: string,
    ): Promise<number> {
        const rules = await this.prisma.mmReorderRule.findMany({
            where: {
                companyId,
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                ...(materialCategoryId
                    ? { material: { materialCategoryId } }
                    : {}),
            },
            select: {
                materialId: true,
                warehouseId: true,
                reorderPoint: true,
            },
            take: 500,
        })
        if (!rules.length) {
            const latest = await this.prisma.mmMrpRun.findFirst({
                where: { companyId, status: 'COMPLETED' },
                orderBy: { executionTime: 'desc' },
                select: { id: true },
            })
            if (!latest) return 0
            return this.prisma.mmMaterialRequirement.count({
                where: {
                    mrpRunId: latest.id,
                    belowReorderPoint: true,
                    ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                },
            })
        }

        const scopedRules = rules.filter((r) => r.warehouseId)
        if (!scopedRules.length) return 0

        const materialIds = [...new Set(scopedRules.map((r) => r.materialId))]
        const ruleWarehouseIds = [
            ...new Set(scopedRules.map((r) => r.warehouseId!).filter(Boolean)),
        ]

        const balanceGroups = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId', 'warehouseId'],
            where: {
                companyId,
                stockStatus: 'UNRESTRICTED',
                materialId: { in: materialIds },
                warehouseId: { in: ruleWarehouseIds },
            },
            _sum: { availableQuantity: true },
        })
        const avail = new Map(
            balanceGroups.map((g) => [
                `${g.materialId}:${g.warehouseId}`,
                Number(g._sum.availableQuantity ?? 0),
            ]),
        )

        let count = 0
        for (const rule of scopedRules) {
            const available =
                avail.get(`${rule.materialId}:${rule.warehouseId}`) ?? 0
            if (available <= Number(rule.reorderPoint)) count++
        }
        return count
    }

    private async countOutOfStock(
        companyId: string,
        warehouseIds: string[] | null,
        materialCategoryId?: string,
    ): Promise<number> {
        const groups = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId'],
            where: {
                companyId,
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                ...(materialCategoryId
                    ? { material: { materialCategoryId } }
                    : {}),
            },
            _sum: { availableQuantity: true },
            _count: { _all: true },
        })
        if (!groups.length) return 0

        const unrestricted = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId'],
            where: {
                companyId,
                stockStatus: 'UNRESTRICTED',
                availableQuantity: { gt: 0 },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                materialId: { in: groups.map((g) => g.materialId) },
            },
            _sum: { availableQuantity: true },
        })
        const hasStock = new Set(unrestricted.map((r) => r.materialId))
        return groups.filter((g) => !hasStock.has(g.materialId)).length
    }

    private async countOverduePos(filters: DashboardFilters): Promise<number> {
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

    private async countTransfersInTransit(
        companyId: string,
        warehouseIds: string[] | null,
    ): Promise<number> {
        const wmWhere = warehouseIds
            ? {
                  status: 'IN_TRANSIT',
                  OR: [
                      { sourceWarehouseId: { in: warehouseIds } },
                      { destinationWarehouseId: { in: warehouseIds } },
                  ],
              }
            : {
                  status: 'IN_TRANSIT',
                  OR: [
                      { sourceWarehouse: { companyId } },
                      { destinationWarehouse: { companyId } },
                  ],
              }

        const [wm, wto] = await Promise.all([
            this.prisma.wmWarehouseTransfer.count({ where: wmWhere }),
            this.prisma.mmWarehouseTransferOrder.count({
                where: {
                    companyId,
                    status: { in: ['IN_TRANSIT', 'DISPATCHED'] },
                    ...(warehouseIds
                        ? {
                              OR: [
                                  { sourceWarehouseId: { in: warehouseIds } },
                                  { destinationWarehouseId: { in: warehouseIds } },
                              ],
                          }
                        : {}),
                },
            }),
        ])
        return wm + wto
    }

    private async avgSupplierScore(companyId: string): Promise<number> {
        const evals = await this.prisma.mmSupplierEvaluation.findMany({
            where: { companyId },
            orderBy: { periodEnd: 'desc' },
            take: 200,
            select: { supplierId: true, overallScore: true },
        })
        const latest = new Map<string, number>()
        for (const e of evals) {
            if (!latest.has(e.supplierId)) {
                latest.set(e.supplierId, Number(e.overallScore))
            }
        }
        if (!latest.size) return 0
        const avg =
            [...latest.values()].reduce((a, b) => a + b, 0) / latest.size
        return Number(avg.toFixed(1))
    }

    private async countLateDeliveries(filters: DashboardFilters): Promise<number> {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return this.prisma.mmPurchaseOrder.count({
            where: {
                companyId: filters.companyId,
                status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] },
                expectedDeliveryDate: { lt: today },
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            },
        })
    }

    private async countQualityFailures(filters: DashboardFilters): Promise<number> {
        return this.prisma.mmQualityInspection.count({
            where: {
                companyId: filters.companyId,
                result: { in: ['FAIL', 'PARTIAL_PASS'] },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
        })
    }

    private async countExpiryRisk(
        companyId: string,
        warehouseIds: string[] | null,
        horizonDays = 30,
    ): Promise<number> {
        const horizon = new Date(Date.now() + horizonDays * 86400000)
        return this.prisma.mmInventoryBalance.count({
            where: {
                companyId,
                quantity: { gt: 0 },
                ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                OR: [
                    { stockStatus: 'EXPIRED' },
                    { batch: { expiryDate: { lte: horizon } } },
                ],
            },
        })
    }

    private async countDocs(model: string, where: any): Promise<number> {
        const client = (this.prisma as any)[model]
        if (!client?.count) return 0
        try {
            return await client.count({ where })
        } catch {
            const { companyId: _c, ...rest } = where
            try {
                return await client.count({ where: rest })
            } catch {
                return 0
            }
        }
    }
}

function kpi(
    key: string,
    label: string,
    value: number,
    group: KpiCard['group'],
    href: string,
    query?: Record<string, string>,
    finance = false,
): KpiCard {
    return {
        key,
        label,
        value: Number(value) || 0,
        group,
        href,
        query,
        ...(finance ? { finance: true } : {}),
    }
}
