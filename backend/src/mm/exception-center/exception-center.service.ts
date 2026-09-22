import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { resolveVisibility } from '../dashboard/dashboard.helpers'
import type {
    MmExceptionCounts,
    MmExceptionDomain,
    MmExceptionFilters,
    MmExceptionItem,
    MmExceptionListResponse,
    MmExceptionSeverity,
} from './exception-center.types'
import {
    ageHoursFrom,
    buildExceptionId,
    isStale,
    mapMatchSeverity,
    paginate,
    parseExceptionId,
    sortExceptions,
} from './exception-center.util'

type CollectorContext = {
    companyId: string
    plantId?: string
    warehouseId?: string
    dateFrom?: Date
    dateTo?: Date
    now: Date
}

@Injectable()
export class ExceptionCenterService {
    constructor(private prisma: PrismaService) {}

    async list(filters: MmExceptionFilters): Promise<MmExceptionListResponse> {
        const all = await this.collectAll(filters)
        const visible = this.applyVisibility(all, filters.role, filters.authority)
        const filtered = this.applyFilters(visible, filters)
        const sorted = sortExceptions(filtered)
        const counts = this.buildCounts(sorted)
        const page = paginate(sorted, filters.page ?? 1, filters.limit ?? 50)

        return {
            data: page.data,
            meta: {
                total: page.total,
                page: page.page,
                limit: page.limit,
                totalPages: page.totalPages,
                counts,
            },
        }
    }

    async getCounts(filters: MmExceptionFilters): Promise<MmExceptionCounts> {
        const all = this.applyFilters(
            this.applyVisibility(
                await this.collectAll(filters),
                filters.role,
                filters.authority,
            ),
            filters,
        )
        return this.buildCounts(all)
    }

    async getOne(id: string, filters: MmExceptionFilters): Promise<MmExceptionItem> {
        const parsed = parseExceptionId(id)
        if (!parsed) throw new NotFoundException('Invalid exception id')

        const all = await this.collectAll(filters)
        const item = all.find((e) => e.id === id)
        if (!item) throw new NotFoundException('Exception not found')

        const visible = this.applyVisibility([item], filters.role, filters.authority)
        if (!visible.length) throw new NotFoundException('Exception not accessible')

        if (item.companyId !== filters.companyId) {
            throw new NotFoundException('Exception not in company scope')
        }
        return item
    }

    private buildCounts(items: MmExceptionItem[]): MmExceptionCounts {
        const bySeverity: MmExceptionCounts['bySeverity'] = {
            CRITICAL: 0,
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0,
        }
        const byDomain: MmExceptionCounts['byDomain'] = {}
        for (const item of items) {
            bySeverity[item.severity]++
            byDomain[item.domain] = (byDomain[item.domain] ?? 0) + 1
        }
        return { total: items.length, bySeverity, byDomain }
    }

    private applyVisibility(
        items: MmExceptionItem[],
        role?: string,
        authority?: string,
    ): MmExceptionItem[] {
        const v = resolveVisibility(role, authority)
        return items.filter((item) => {
            switch (item.domain) {
                case 'procurement':
                    return v.procurement
                case 'receiving':
                case 'quality':
                case 'warehouse':
                case 'transfers':
                    return v.warehouse
                case 'inventory':
                case 'inventory_control':
                case 'mrp':
                    return v.inventory
                case 'integration':
                    return v.analytics
                default:
                    return true
            }
        })
    }

    private applyFilters(
        items: MmExceptionItem[],
        filters: MmExceptionFilters,
    ): MmExceptionItem[] {
        return items.filter((item) => {
            if (item.companyId !== filters.companyId) return false
            if (filters.plantId && item.plantId && item.plantId !== filters.plantId)
                return false
            if (
                filters.warehouseId &&
                item.warehouseId &&
                item.warehouseId !== filters.warehouseId
            )
                return false
            if (filters.severity && item.severity !== filters.severity) return false
            if (filters.domain && item.domain !== filters.domain) return false
            if (filters.status && item.status !== filters.status) return false
            if (!filters.includeStale && item.stale) return false
            if (filters.dateFrom) {
                const from = new Date(filters.dateFrom).getTime()
                if (new Date(item.detectedAt).getTime() < from) return false
            }
            if (filters.dateTo) {
                const to = new Date(filters.dateTo).getTime()
                if (new Date(item.detectedAt).getTime() > to) return false
            }
            return true
        })
    }

    private async collectAll(filters: MmExceptionFilters): Promise<MmExceptionItem[]> {
        const ctx: CollectorContext = {
            companyId: filters.companyId,
            plantId: filters.plantId,
            warehouseId: filters.warehouseId,
            dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
            now: new Date(),
        }

        const batches = await Promise.all([
            this.collectProcurement(ctx),
            this.collectReceiving(ctx),
            this.collectQuality(ctx),
            this.collectInventory(ctx),
            this.collectWarehouse(ctx),
            this.collectInventoryControl(ctx),
            this.collectTransfers(ctx),
            this.collectMrp(ctx),
            this.collectIntegration(ctx),
        ])

        return batches.flat()
    }

    private item(
        input: Omit<MmExceptionItem, 'id' | 'ageHours' | 'stale'> & { sourceId: string },
        ctx: CollectorContext,
    ): MmExceptionItem {
        const detectedAt = input.detectedAt
        const detected = new Date(detectedAt)
        return {
            ...input,
            id: buildExceptionId(input.domain, input.type, input.sourceId),
            ageHours: ageHoursFrom(detected, ctx.now),
            stale: isStale(detected, ctx.now),
        }
    }

    // ── Procurement ──

    private async collectProcurement(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const today = new Date(ctx.now)
        today.setHours(0, 0, 0, 0)

        const overduePos = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId: ctx.companyId,
                status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] },
                expectedDeliveryDate: { lt: today },
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            select: {
                id: true,
                poNumber: true,
                status: true,
                expectedDeliveryDate: true,
                createdAt: true,
                buyerId: true,
                warehouseId: true,
                companyId: true,
            },
            take: 100,
        })
        for (const po of overduePos) {
            items.push(
                this.item(
                    {
                        sourceId: po.id,
                        type: 'OVERDUE_PO',
                        domain: 'procurement',
                        severity: 'HIGH',
                        status: po.status,
                        title: `Overdue PO ${po.poNumber}`,
                        message: `Expected delivery was ${po.expectedDeliveryDate?.toISOString().slice(0, 10)}`,
                        source: 'MmPurchaseOrder',
                        detectedAt: (po.expectedDeliveryDate ?? po.createdAt).toISOString(),
                        dueAt: po.expectedDeliveryDate?.toISOString(),
                        companyId: po.companyId,
                        warehouseId: po.warehouseId ?? undefined,
                        owner: po.buyerId ?? undefined,
                        recommendedAction: 'Review PO and follow up with supplier',
                        document: { type: 'PURCHASE_ORDER', id: po.id, number: po.poNumber },
                        href: `/modules/mm/procurement/purchase-orders/${po.id}`,
                    },
                    ctx,
                ),
            )
        }

        const pendingPos = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'PENDING_APPROVAL',
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            select: {
                id: true,
                poNumber: true,
                status: true,
                createdAt: true,
                buyerId: true,
                warehouseId: true,
                companyId: true,
            },
            take: 100,
        })
        for (const po of pendingPos) {
            items.push(
                this.item(
                    {
                        sourceId: po.id,
                        type: 'PENDING_APPROVAL',
                        domain: 'procurement',
                        severity: 'MEDIUM',
                        status: po.status,
                        title: `PO pending approval ${po.poNumber}`,
                        source: 'MmPurchaseOrder',
                        detectedAt: po.createdAt.toISOString(),
                        companyId: po.companyId,
                        warehouseId: po.warehouseId ?? undefined,
                        owner: po.buyerId ?? undefined,
                        recommendedAction: 'Complete approval workflow',
                        document: { type: 'PURCHASE_ORDER', id: po.id, number: po.poNumber },
                        href: `/modules/mm/procurement/purchase-orders/${po.id}`,
                    },
                    ctx,
                ),
            )
        }

        const blockedSuppliers = await this.prisma.mmSupplier.findMany({
            where: {
                companyId: ctx.companyId,
                sourcingType: 'BLOCKED',
                deletedAt: null,
            },
            select: {
                id: true,
                supplierCode: true,
                supplierName: true,
                blockReason: true,
                updatedAt: true,
                companyId: true,
            },
            take: 100,
        })
        for (const s of blockedSuppliers) {
            items.push(
                this.item(
                    {
                        sourceId: s.id,
                        type: 'SUPPLIER_BLOCKED',
                        domain: 'procurement',
                        severity: 'HIGH',
                        status: 'BLOCKED',
                        title: `Supplier blocked: ${s.supplierName}`,
                        message: s.blockReason ?? undefined,
                        source: 'MmSupplier',
                        detectedAt: s.updatedAt.toISOString(),
                        companyId: s.companyId,
                        supplierId: s.id,
                        recommendedAction: 'Review supplier block and sourcing policy',
                        document: { type: 'SUPPLIER', id: s.id, number: s.supplierCode },
                        href: '/modules/mm/supplier-management/suppliers',
                    },
                    ctx,
                ),
            )
        }

        const priceVariances = await this.prisma.mmMatchException.findMany({
            where: {
                status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                varianceType: 'PRICE',
                purchaseOrder: { companyId: ctx.companyId },
            },
            include: {
                purchaseOrder: { select: { poNumber: true, companyId: true, warehouseId: true } },
                invoice: { select: { invoiceNumber: true } },
            },
            take: 100,
        })
        for (const ex of priceVariances) {
            items.push(
                this.item(
                    {
                        sourceId: ex.id,
                        type: 'PRICE_VARIANCE',
                        domain: 'procurement',
                        severity: mapMatchSeverity(ex.severity),
                        status: ex.status,
                        title: `Price variance on PO ${ex.purchaseOrder.poNumber}`,
                        message: ex.message,
                        source: 'MmMatchException',
                        detectedAt: ex.createdAt.toISOString(),
                        companyId: ex.purchaseOrder.companyId,
                        warehouseId: ex.purchaseOrder.warehouseId ?? undefined,
                        recommendedAction: 'Review match exception and resolve or waive',
                        document: {
                            type: 'PURCHASE_ORDER',
                            id: ex.purchaseOrderId,
                            number: ex.purchaseOrder.poNumber,
                        },
                        href: '/modules/mm/procurement/match-exceptions',
                        metadata: { invoiceNumber: ex.invoice?.invoiceNumber },
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── Receiving ──

    private async collectReceiving(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const variances = await this.prisma.mmReceivingVariance.findMany({
            where: {
                status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                receivingDocument: {
                    companyId: ctx.companyId,
                    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                },
            },
            include: {
                receivingDocument: {
                    select: {
                        id: true,
                        documentNumber: true,
                        companyId: true,
                        warehouseId: true,
                    },
                },
            },
            take: 150,
        })

        const typeMap: Record<string, { type: string; severity: MmExceptionSeverity }> = {
            OVER_RECEIPT: { type: 'OVER_RECEIPT', severity: 'HIGH' },
            UNDER_RECEIPT: { type: 'UNDER_RECEIPT', severity: 'MEDIUM' },
            UNEXPECTED_ITEM: { type: 'UNEXPECTED_ITEM', severity: 'HIGH' },
            DAMAGED: { type: 'DAMAGED_RECEIPT', severity: 'HIGH' },
        }

        for (const v of variances) {
            const mapped = typeMap[v.varianceType] ?? {
                type: 'RECEIVING_VARIANCE',
                severity: 'MEDIUM' as MmExceptionSeverity,
            }
            items.push(
                this.item(
                    {
                        sourceId: v.id,
                        type: mapped.type,
                        domain: 'receiving',
                        severity: mapped.severity,
                        status: v.status,
                        title: `${v.varianceType.replace(/_/g, ' ')} on ${v.receivingDocument.documentNumber}`,
                        message: v.description ?? undefined,
                        source: 'MmReceivingVariance',
                        detectedAt: v.detectedAt.toISOString(),
                        companyId: v.receivingDocument.companyId,
                        warehouseId: v.receivingDocument.warehouseId,
                        recommendedAction: 'Review receiving variance in receiving module',
                        document: {
                            type: 'RECEIVING_DOCUMENT',
                            id: v.receivingDocumentId,
                            number: v.receivingDocument.documentNumber,
                        },
                        href: '/modules/mm/receiving/receiving-variances',
                        metadata: { varianceType: v.varianceType, quantity: Number(v.quantity) },
                    },
                    ctx,
                ),
            )
        }
        return items
    }

    // ── Quality ──

    private async collectQuality(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []

        const holds = await this.prisma.mmQualityHold.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'ACTIVE',
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            take: 100,
        })
        for (const h of holds) {
            items.push(
                this.item(
                    {
                        sourceId: h.id,
                        type: 'QUALITY_HOLD',
                        domain: 'quality',
                        severity: 'CRITICAL',
                        status: h.status,
                        title: `Quality hold ${h.holdNumber}`,
                        message: h.reason,
                        source: 'MmQualityHold',
                        detectedAt: h.heldAt.toISOString(),
                        companyId: h.companyId,
                        warehouseId: h.warehouseId ?? undefined,
                        materialId: h.materialId ?? undefined,
                        owner: h.heldBy ?? undefined,
                        recommendedAction: 'Release or disposition hold in quality module',
                        document: { type: 'QUALITY_HOLD', id: h.id, number: h.holdNumber },
                        href: '/modules/mm/receiving/quality-holds',
                    },
                    ctx,
                ),
            )
        }

        const failedLots = await this.prisma.mmInspectionLot.findMany({
            where: {
                companyId: ctx.companyId,
                OR: [
                    { result: { in: ['FAIL', 'PARTIAL_PASS', 'REJECT'] } },
                    { status: 'PENDING_DECISION' },
                ],
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                ...(ctx.plantId ? { plantId: ctx.plantId } : {}),
            },
            select: {
                id: true,
                lotNumber: true,
                status: true,
                result: true,
                createdAt: true,
                companyId: true,
                warehouseId: true,
                plantId: true,
                assignedInspector: true,
            },
            take: 100,
        })
        for (const lot of failedLots) {
            items.push(
                this.item(
                    {
                        sourceId: lot.id,
                        type: 'FAILED_INSPECTION',
                        domain: 'quality',
                        severity: 'HIGH',
                        status: lot.status,
                        title: `Failed inspection ${lot.lotNumber}`,
                        message: lot.result ?? undefined,
                        source: 'MmInspectionLot',
                        detectedAt: lot.createdAt.toISOString(),
                        companyId: lot.companyId,
                        warehouseId: lot.warehouseId,
                        plantId: lot.plantId ?? undefined,
                        owner: lot.assignedInspector ?? undefined,
                        recommendedAction: 'Record quality decision or CAPA',
                        document: { type: 'INSPECTION_LOT', id: lot.id, number: lot.lotNumber },
                        href: `/modules/mm/receiving/inspection-lots/${lot.id}`,
                    },
                    ctx,
                ),
            )
        }

        const ncs = await this.prisma.mmNonconformance.findMany({
            where: {
                companyId: ctx.companyId,
                status: { in: ['OPEN', 'UNDER_REVIEW', 'CORRECTIVE_ACTION'] },
            },
            take: 100,
        })
        for (const nc of ncs) {
            items.push(
                this.item(
                    {
                        sourceId: nc.id,
                        type: 'UNRESOLVED_NONCONFORMANCE',
                        domain: 'quality',
                        severity: 'HIGH',
                        status: nc.status,
                        title: `Nonconformance ${nc.ncNumber}`,
                        source: 'MmNonconformance',
                        detectedAt: nc.createdAt.toISOString(),
                        companyId: nc.companyId,
                        recommendedAction: 'Resolve nonconformance record',
                        document: { type: 'NONCONFORMANCE', id: nc.id, number: nc.ncNumber },
                        href: '/modules/mm/receiving/nonconformance',
                    },
                    ctx,
                ),
            )
        }

        const capas = await this.prisma.mmCorrectiveAction.findMany({
            where: {
                companyId: ctx.companyId,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                dueDate: { lt: ctx.now },
            },
            take: 100,
        })
        for (const capa of capas) {
            items.push(
                this.item(
                    {
                        sourceId: capa.id,
                        type: 'OVERDUE_CORRECTIVE_ACTION',
                        domain: 'quality',
                        severity: 'MEDIUM',
                        status: capa.status,
                        title: `Overdue CAPA ${capa.actionNumber}`,
                        source: 'MmCorrectiveAction',
                        detectedAt: capa.createdAt.toISOString(),
                        dueAt: capa.dueDate?.toISOString(),
                        companyId: capa.companyId,
                        owner: capa.owner ?? undefined,
                        recommendedAction: 'Complete corrective action',
                        document: { type: 'CORRECTIVE_ACTION', id: capa.id, number: capa.actionNumber },
                        href: '/modules/mm/receiving/nonconformance',
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── Inventory ──

    private async collectInventory(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const latestRun = await this.prisma.mmMrpRun.findFirst({
            where: { companyId: ctx.companyId, status: 'COMPLETED' },
            orderBy: { executionTime: 'desc' },
            select: { id: true },
        })

        if (latestRun) {
            const lowStock = await this.prisma.mmMaterialRequirement.findMany({
                where: {
                    mrpRunId: latestRun.id,
                    belowReorderPoint: true,
                    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                },
                include: {
                    material: { select: { materialCode: true, materialName: true } },
                },
                take: 100,
            })
            for (const req of lowStock) {
                items.push(
                    this.item(
                        {
                            sourceId: req.id,
                            type: 'LOW_STOCK',
                            domain: 'inventory',
                            severity: 'MEDIUM',
                            status: 'OPEN',
                            title: `Low stock: ${req.material.materialCode}`,
                            message: req.material.materialName,
                            source: 'MmMaterialRequirement',
                            detectedAt: req.createdAt.toISOString(),
                            companyId: req.companyId,
                            warehouseId: req.warehouseId,
                            materialId: req.materialId,
                            recommendedAction: 'Review reorder rules or create PR',
                            href: '/modules/mm/planning-mrp/reorder-point',
                            metadata: { availableQty: Number(req.availableQty) },
                        },
                        ctx,
                    ),
                )
            }
        }

        const blocked = (
            await this.prisma.mmInventoryBalance.groupBy({
                by: ['materialId', 'warehouseId'],
                where: {
                    companyId: ctx.companyId,
                    stockStatus: 'BLOCKED',
                    quantity: { gt: 0 },
                    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                },
                _sum: { quantity: true },
            })
        ).slice(0, 100)
        for (const row of blocked) {
            items.push(
                this.item(
                    {
                        sourceId: `${row.materialId}:${row.warehouseId}`,
                        type: 'BLOCKED_STOCK',
                        domain: 'inventory',
                        severity: 'MEDIUM',
                        status: 'BLOCKED',
                        title: 'Blocked stock on hand',
                        source: 'MmInventoryBalance',
                        detectedAt: ctx.now.toISOString(),
                        companyId: ctx.companyId,
                        warehouseId: row.warehouseId,
                        materialId: row.materialId,
                        recommendedAction: 'Review blocked stock disposition',
                        href: '/modules/mm/returns-disposal/damaged-stock',
                        metadata: { quantity: Number(row._sum.quantity ?? 0) },
                    },
                    ctx,
                ),
            )
        }

        const shortages = await this.prisma.mmInventoryReservationHeader.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'SHORT',
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            take: 100,
        })
        for (const r of shortages) {
            items.push(
                this.item(
                    {
                        sourceId: r.id,
                        type: 'RESERVATION_SHORTAGE',
                        domain: 'inventory',
                        severity: 'HIGH',
                        status: r.status,
                        title: `Reservation shortage ${r.reservationNumber}`,
                        source: 'MmInventoryReservationHeader',
                        detectedAt: r.updatedAt.toISOString(),
                        companyId: r.companyId,
                        warehouseId: r.warehouseId,
                        recommendedAction: 'Review ATP and adjust source document',
                        document: {
                            type: 'RESERVATION',
                            id: r.id,
                            number: r.reservationNumber,
                        },
                        href: '/modules/mm/inventory-management/reservations',
                    },
                    ctx,
                ),
            )
        }

        const partialAlloc = await this.prisma.mmInventoryReservationLine.findMany({
            where: {
                status: { in: ['PARTIAL', 'SHORT'] },
                header: {
                    companyId: ctx.companyId,
                    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                },
            },
            include: {
                header: { select: { reservationNumber: true, companyId: true, warehouseId: true } },
            },
            take: 100,
        })
        for (const line of partialAlloc) {
            items.push(
                this.item(
                    {
                        sourceId: line.id,
                        type: 'ALLOCATION_SHORTAGE',
                        domain: 'inventory',
                        severity: 'HIGH',
                        status: line.status,
                        title: `Allocation shortage on ${line.header.reservationNumber}`,
                        source: 'MmInventoryReservationLine',
                        detectedAt: line.updatedAt.toISOString(),
                        companyId: line.header.companyId,
                        warehouseId: line.header.warehouseId,
                        materialId: line.materialId,
                        recommendedAction: 'Re-run allocation or adjust demand',
                        href: '/modules/mm/inventory-management/reservations',
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── Warehouse ──

    private async collectWarehouse(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const overdueCutoff = new Date(ctx.now.getTime() - 48 * 3600000)

        const taskExceptions = await this.prisma.wmWarehouseTask.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'EXCEPTION',
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                ...(ctx.plantId ? { plantId: ctx.plantId } : {}),
            },
            include: {
                exceptions: { where: { resolvedAt: null }, take: 1, orderBy: { createdAt: 'desc' } },
            },
            take: 100,
        })
        for (const t of taskExceptions) {
            const ex = t.exceptions[0]
            items.push(
                this.item(
                    {
                        sourceId: t.id,
                        type: ex?.exceptionCode === 'WRONG_BIN' ? 'WRONG_BIN' : 'TASK_EXCEPTION',
                        domain: 'warehouse',
                        severity: 'HIGH',
                        status: t.status,
                        title: `Warehouse task exception ${t.taskNumber}`,
                        message: ex?.details ?? t.exceptionReason ?? undefined,
                        source: 'WmWarehouseTask',
                        detectedAt: (ex?.createdAt ?? t.updatedAt).toISOString(),
                        companyId: t.companyId,
                        plantId: t.plantId ?? undefined,
                        warehouseId: t.warehouseId,
                        materialId: t.materialId ?? undefined,
                        owner: t.assignedUserId ?? undefined,
                        recommendedAction: 'Resolve task exception in warehouse execution',
                        document: { type: 'WAREHOUSE_TASK', id: t.id, number: t.taskNumber },
                        href: '/modules/mm/warehouse-management/exceptions',
                        metadata: { exceptionCode: ex?.exceptionCode },
                    },
                    ctx,
                ),
            )
        }

        const overdueTasks = await this.prisma.wmWarehouseTask.findMany({
            where: {
                companyId: ctx.companyId,
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
                createdAt: { lt: overdueCutoff },
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            take: 100,
        })
        for (const t of overdueTasks) {
            items.push(
                this.item(
                    {
                        sourceId: t.id,
                        type: 'OVERDUE_TASK',
                        domain: 'warehouse',
                        severity: 'MEDIUM',
                        status: t.status,
                        title: `Overdue warehouse task ${t.taskNumber}`,
                        source: 'WmWarehouseTask',
                        detectedAt: t.createdAt.toISOString(),
                        companyId: t.companyId,
                        plantId: t.plantId ?? undefined,
                        warehouseId: t.warehouseId,
                        owner: t.assignedUserId ?? undefined,
                        recommendedAction: 'Assign or complete warehouse task',
                        document: { type: 'WAREHOUSE_TASK', id: t.id, number: t.taskNumber },
                        href: '/modules/mm/warehouse-management/task-queue',
                    },
                    ctx,
                ),
            )
        }

        const pickShorts = await this.prisma.wmPickingTask.findMany({
            where: {
                status: 'PARTIALLY_PICKED',
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                ...(ctx.companyId
                    ? { OR: [{ companyId: ctx.companyId }, { companyId: null }] }
                    : {}),
            },
            take: 100,
        })
        for (const p of pickShorts) {
            items.push(
                this.item(
                    {
                        sourceId: p.id,
                        type: 'PICK_SHORT',
                        domain: 'warehouse',
                        severity: 'HIGH',
                        status: p.status,
                        title: `Pick short ${p.taskNumber}`,
                        source: 'WmPickingTask',
                        detectedAt: p.updatedAt.toISOString(),
                        companyId: ctx.companyId,
                        warehouseId: p.warehouseId,
                        materialId: p.materialId,
                        owner: p.assignedUser ?? undefined,
                        recommendedAction: 'Complete pick or adjust reservation',
                        document: { type: 'PICK_TASK', id: p.id, number: p.taskNumber },
                        href: '/modules/mm/warehouse-management/my-tasks',
                        metadata: {
                            requiredQty: Number(p.requiredQty),
                            pickedQty: Number(p.pickedQty),
                        },
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── Inventory control ──

    private async collectInventoryControl(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const variances = await this.prisma.mmCountVariance.findMany({
            where: {
                status: { in: ['OPEN', 'RECOUNT_REQUIRED', 'PENDING_ADJUSTMENT'] },
                task: {
                    session: {
                        companyId: ctx.companyId,
                        ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
                    },
                },
            },
            include: {
                task: {
                    select: {
                        id: true,
                        materialId: true,
                        session: { select: { warehouseId: true, companyId: true } },
                    },
                },
            },
            take: 100,
        })

        const statusType: Record<string, string> = {
            OPEN: 'COUNT_VARIANCE',
            RECOUNT_REQUIRED: 'RECOUNT_REQUIRED',
            PENDING_ADJUSTMENT: 'ADJUSTMENT_PENDING',
        }

        for (const v of variances) {
            items.push(
                this.item(
                    {
                        sourceId: v.id,
                        type: statusType[v.status] ?? 'COUNT_VARIANCE',
                        domain: 'inventory_control',
                        severity: v.status === 'PENDING_ADJUSTMENT' ? 'HIGH' : 'MEDIUM',
                        status: v.status,
                        title: `Count variance (${v.status})`,
                        source: 'MmCountVariance',
                        detectedAt: v.createdAt.toISOString(),
                        companyId: v.task.session.companyId,
                        warehouseId: v.task.session.warehouseId,
                        materialId: v.task.materialId,
                        recommendedAction: 'Review count variance workflow',
                        href: '/modules/mm/inventory-control/variance-analysis',
                        metadata: { varianceQty: Number(v.varianceQuantity) },
                    },
                    ctx,
                ),
            )
        }
        return items
    }

    // ── Transfers ──

    private async collectTransfers(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const overdueCutoff = new Date(ctx.now.getTime() - 7 * 86400000)

        const overdueStos = await this.prisma.mmStockTransferOrder.findMany({
            where: {
                companyId: ctx.companyId,
                status: { notIn: ['CLOSED', 'CANCELLED', 'COMPLETED'] },
                createdAt: { lt: overdueCutoff },
                ...(ctx.warehouseId
                    ? {
                          OR: [
                              { sourceWarehouseId: ctx.warehouseId },
                              { destinationWarehouseId: ctx.warehouseId },
                          ],
                      }
                    : {}),
            },
            take: 100,
        })
        for (const sto of overdueStos) {
            items.push(
                this.item(
                    {
                        sourceId: sto.id,
                        type: 'TRANSFER_OVERDUE',
                        domain: 'transfers',
                        severity: 'MEDIUM',
                        status: sto.status,
                        title: `Transfer overdue ${sto.orderNumber}`,
                        source: 'MmStockTransferOrder',
                        detectedAt: sto.createdAt.toISOString(),
                        companyId: sto.companyId,
                        recommendedAction: 'Complete or cancel stock transfer order',
                        document: { type: 'STO', id: sto.id, number: sto.orderNumber },
                        href: '/modules/mm/inventory-management/stock-transfers',
                    },
                    ctx,
                ),
            )
        }

        const inTransit = await this.prisma.mmStockTransferOrder.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'IN_TRANSIT',
                updatedAt: { lt: overdueCutoff },
            },
            take: 100,
        })
        for (const sto of inTransit) {
            items.push(
                this.item(
                    {
                        sourceId: `${sto.id}:transit`,
                        type: 'TRANSIT_AGING',
                        domain: 'transfers',
                        severity: 'HIGH',
                        status: sto.status,
                        title: `In-transit aging ${sto.orderNumber}`,
                        source: 'MmStockTransferOrder',
                        detectedAt: sto.updatedAt.toISOString(),
                        companyId: sto.companyId,
                        recommendedAction: 'Receive transfer at destination warehouse',
                        document: { type: 'STO', id: sto.id, number: sto.orderNumber },
                        href: '/modules/mm/warehouse-management/in-transit',
                    },
                    ctx,
                ),
            )
        }

        const shortLines = await this.prisma.mmStockTransferOrderLine.findMany({
            where: {
                status: { in: ['SHORT', 'PARTIAL'] },
                order: { companyId: ctx.companyId },
            },
            include: {
                order: { select: { orderNumber: true, companyId: true } },
            },
            take: 100,
        })
        for (const line of shortLines) {
            items.push(
                this.item(
                    {
                        sourceId: line.id,
                        type: 'TRANSFER_SHORTAGE',
                        domain: 'transfers',
                        severity: 'HIGH',
                        status: line.status,
                        title: `Transfer shortage on ${line.order.orderNumber}`,
                        source: 'MmStockTransferOrderLine',
                        detectedAt: line.updatedAt.toISOString(),
                        companyId: line.order.companyId,
                        materialId: line.materialId,
                        recommendedAction: 'Review STO line dispatch/receipt quantities',
                        href: '/modules/mm/inventory-management/stock-transfers',
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── MRP ──

    private async collectMrp(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []
        const latestRun = await this.prisma.mmMrpRun.findFirst({
            where: { companyId: ctx.companyId, status: 'COMPLETED' },
            orderBy: { executionTime: 'desc' },
            select: { id: true, executionTime: true },
        })
        if (!latestRun) return items

        const shortages = await this.prisma.mmMaterialRequirement.findMany({
            where: {
                mrpRunId: latestRun.id,
                shortage: true,
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            include: { material: { select: { materialCode: true } } },
            take: 100,
        })
        for (const req of shortages) {
            items.push(
                this.item(
                    {
                        sourceId: req.id,
                        type: 'MRP_SHORTAGE',
                        domain: 'mrp',
                        severity: 'CRITICAL',
                        status: 'OPEN',
                        title: `MRP shortage ${req.material.materialCode}`,
                        source: 'MmMaterialRequirement',
                        detectedAt: req.createdAt.toISOString(),
                        companyId: req.companyId,
                        warehouseId: req.warehouseId,
                        materialId: req.materialId,
                        recommendedAction: 'Review MRP requirement and create supply',
                        href: '/modules/mm/planning-mrp/shortage-monitor',
                        metadata: { shortageQty: Number(req.shortageQty) },
                    },
                    ctx,
                ),
            )
        }

        const lateSupply = await this.prisma.mmMaterialRequirement.findMany({
            where: {
                mrpRunId: latestRun.id,
                expectedProcurementDate: { gt: ctx.now },
                requiredDate: { lt: ctx.now },
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            include: { material: { select: { materialCode: true } } },
            take: 50,
        })
        for (const req of lateSupply) {
            items.push(
                this.item(
                    {
                        sourceId: `${req.id}:late`,
                        type: 'LATE_SUPPLY',
                        domain: 'mrp',
                        severity: 'HIGH',
                        status: 'OPEN',
                        title: `Late supply ${req.material.materialCode}`,
                        source: 'MmMaterialRequirement',
                        detectedAt: req.createdAt.toISOString(),
                        dueAt: req.requiredDate?.toISOString(),
                        companyId: req.companyId,
                        warehouseId: req.warehouseId,
                        materialId: req.materialId,
                        recommendedAction: 'Expedite PO or replan supply',
                        href: '/modules/mm/planning-mrp/material-requirements',
                    },
                    ctx,
                ),
            )
        }

        const noSupplier = await this.prisma.mmProcurementSuggestion.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'OPEN',
                preferredSupplierId: null,
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            include: { material: { select: { materialCode: true } } },
            take: 50,
        })
        for (const s of noSupplier) {
            items.push(
                this.item(
                    {
                        sourceId: s.id,
                        type: 'NO_APPROVED_SUPPLIER',
                        domain: 'mrp',
                        severity: 'MEDIUM',
                        status: s.status,
                        title: `No supplier for ${s.material.materialCode}`,
                        source: 'MmProcurementSuggestion',
                        detectedAt: s.createdAt.toISOString(),
                        companyId: s.companyId,
                        warehouseId: s.warehouseId,
                        materialId: s.materialId,
                        recommendedAction: 'Assign preferred supplier or create RFQ',
                        href: '/modules/mm/planning-mrp/procurement-suggestions',
                    },
                    ctx,
                ),
            )
        }

        const moqIssues = await this.prisma.mmProcurementSuggestion.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'OPEN',
                shortageReason: { contains: 'MOQ', mode: 'insensitive' },
            },
            include: { material: { select: { materialCode: true } } },
            take: 50,
        })
        for (const s of moqIssues) {
            items.push(
                this.item(
                    {
                        sourceId: `${s.id}:moq`,
                        type: 'MOQ_ISSUE',
                        domain: 'mrp',
                        severity: 'LOW',
                        status: s.status,
                        title: `MOQ issue ${s.material.materialCode}`,
                        message: s.explanation ?? undefined,
                        source: 'MmProcurementSuggestion',
                        detectedAt: s.createdAt.toISOString(),
                        companyId: s.companyId,
                        warehouseId: s.warehouseId,
                        materialId: s.materialId,
                        recommendedAction: 'Review MOQ and lot size parameters',
                        href: '/modules/mm/planning-mrp/procurement-suggestions',
                    },
                    ctx,
                ),
            )
        }

        const leadTimeCandidates = await this.prisma.mmMaterialRequirement.findMany({
            where: {
                mrpRunId: latestRun.id,
                leadTimeDays: { gt: 0 },
                requiredDate: { not: null },
                ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
            },
            include: { material: { select: { materialCode: true } } },
            take: 100,
        })
        for (const req of leadTimeCandidates) {
            if (!req.requiredDate) continue
            const earliestFeasible = new Date(ctx.now)
            earliestFeasible.setDate(earliestFeasible.getDate() + req.leadTimeDays)
            if (req.requiredDate >= earliestFeasible) continue

            items.push(
                this.item(
                    {
                        sourceId: `${req.id}:lead`,
                        type: 'LEAD_TIME_ISSUE',
                        domain: 'mrp',
                        severity: 'MEDIUM',
                        status: 'OPEN',
                        title: `Lead time issue ${req.material.materialCode}`,
                        message: `Required ${req.requiredDate.toISOString().slice(0, 10)} but lead time is ${req.leadTimeDays}d`,
                        source: 'MmMaterialRequirement',
                        detectedAt: req.createdAt.toISOString(),
                        dueAt: req.requiredDate.toISOString(),
                        companyId: req.companyId,
                        warehouseId: req.warehouseId,
                        materialId: req.materialId,
                        recommendedAction: 'Adjust requirement date or expedite supply',
                        href: '/modules/mm/planning-mrp/material-requirements',
                        metadata: { leadTimeDays: req.leadTimeDays },
                    },
                    ctx,
                ),
            )
        }

        return items
    }

    // ── Integration ──

    private async collectIntegration(ctx: CollectorContext): Promise<MmExceptionItem[]> {
        const items: MmExceptionItem[] = []

        const deadLetters = await this.prisma.mmDomainEventOutbox.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'DEAD_LETTER',
                ...(ctx.plantId ? { plantId: ctx.plantId } : {}),
            },
            take: 100,
        })
        for (const ev of deadLetters) {
            items.push(
                this.item(
                    {
                        sourceId: ev.id,
                        type: 'DEAD_LETTER_EVENT',
                        domain: 'integration',
                        severity: 'CRITICAL',
                        status: ev.status,
                        title: `Dead letter: ${ev.eventType}`,
                        message: ev.lastError ?? undefined,
                        source: 'MmDomainEventOutbox',
                        detectedAt: ev.createdAt.toISOString(),
                        companyId: ev.companyId,
                        plantId: ev.plantId ?? undefined,
                        recommendedAction: 'Review integration monitor and replay or fix payload',
                        document: {
                            type: ev.sourceEntityType,
                            id: ev.sourceEntityId,
                        },
                        href: '/modules/mm/exception-center?domain=integration',
                        metadata: {
                            eventType: ev.eventType,
                            correlationId: ev.correlationId,
                            retryCount: ev.retryCount,
                        },
                    },
                    ctx,
                ),
            )
        }

        const failedEvents = await this.prisma.mmDomainEventOutbox.findMany({
            where: {
                companyId: ctx.companyId,
                status: 'FAILED',
            },
            take: 100,
        })
        for (const ev of failedEvents) {
            items.push(
                this.item(
                    {
                        sourceId: ev.id,
                        type: 'FAILED_EVENT',
                        domain: 'integration',
                        severity: 'HIGH',
                        status: ev.status,
                        title: `Failed event: ${ev.eventType}`,
                        message: ev.lastError ?? undefined,
                        source: 'MmDomainEventOutbox',
                        detectedAt: ev.createdAt.toISOString(),
                        companyId: ev.companyId,
                        plantId: ev.plantId ?? undefined,
                        recommendedAction: 'Investigate failed domain event dispatch',
                        href: '/modules/mm/exception-center?domain=integration',
                        metadata: { eventType: ev.eventType, retryCount: ev.retryCount },
                    },
                    ctx,
                ),
            )
        }

        const consumerFailures = await this.prisma.mmEventConsumerReceipt.findMany({
            where: { status: 'FAILED' },
            take: 100,
        })
        for (const rec of consumerFailures) {
            items.push(
                this.item(
                    {
                        sourceId: rec.id,
                        type: 'CONSUMER_FAILURE',
                        domain: 'integration',
                        severity: 'CRITICAL',
                        status: rec.status,
                        title: `Consumer failure: ${rec.consumerId}`,
                        message: rec.lastError ?? undefined,
                        source: 'MmEventConsumerReceipt',
                        detectedAt: rec.updatedAt.toISOString(),
                        companyId: ctx.companyId,
                        recommendedAction: 'Review integration consumer and retry handler',
                        href: '/modules/mm/exception-center?domain=integration',
                        metadata: {
                            consumerId: rec.consumerId,
                            eventType: rec.eventType,
                            retryCount: rec.retryCount,
                        },
                    },
                    ctx,
                ),
            )
        }

        return items
    }
}
