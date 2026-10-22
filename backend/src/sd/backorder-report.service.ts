import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { ListBackordersQueryDto } from './dto/backorder.dto'

/** Lines open longer than this are critical shortages. */
export const CRITICAL_AGE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** Purchase order states MM planning treats as incoming supply. */
const INCOMING_PO_STATUSES = ['SENT', 'PARTIALLY_RECEIVED']
const CLOSED_LINE_STATUSES = ['FULFILLED', 'CANCELLED']

/**
 * STOCK_SHORTAGE: MM reported the line short at reservation.
 * AWAITING_RESERVATION: mapped to MM but not (fully) reserved yet.
 * NO_MATERIAL: commercial-only SKU, MM cannot reserve or pick it.
 */
export type BackorderReason =
    | 'STOCK_SHORTAGE'
    | 'AWAITING_RESERVATION'
    | 'NO_MATERIAL'

type QtyLike = Decimal | number | string | null

/**
 * Open (unfulfilled) sales quantity of a line. Coverage is reserved + issued in
 * base UOM; the uncovered share is converted back to the sales UOM.
 */
export function openQuantity(line: {
    quantity: QtyLike
    baseQuantity: QtyLike
    reservedQuantity: QtyLike
    issuedQuantity: QtyLike
}) {
    const ordered = Number(line.quantity ?? 0)
    const required = Number(line.baseQuantity ?? line.quantity ?? 0)
    if (ordered <= 0 || required <= 0) return 0
    const covered =
        Number(line.reservedQuantity ?? 0) + Number(line.issuedQuantity ?? 0)
    const uncoveredShare = Math.min(
        1,
        Math.max(0, (required - covered) / required),
    )
    return Math.round(ordered * uncoveredShare * 1000) / 1000
}

export function backorderReason(line: {
    integrationStatus: string
    materialId: string | null
}): BackorderReason {
    if (!line.materialId) return 'NO_MATERIAL'
    if (line.integrationStatus === 'SHORT') return 'STOCK_SHORTAGE'
    return 'AWAITING_RESERVATION'
}

/** Read model over open SD order lines; reservation/ATP stay owned by MM. */
@Injectable()
export class BackorderReportService {
    constructor(private prisma: PrismaService) {}

    async list(query: ListBackordersQueryDto, now: Date = new Date()) {
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(
            100,
            Math.max(1, Number(query.pageSize) || 20),
        )

        const lines = await this.prisma.sdSalesOrderLine.findMany({
            where: {
                integrationStatus: { notIn: CLOSED_LINE_STATUSES },
                salesOrder: { status: 'CONFIRMED', shippedAt: null },
            },
            select: {
                id: true,
                lineNumber: true,
                divisionId: true,
                materialId: true,
                sku: true,
                productSkuSnapshot: true,
                productNameSnapshot: true,
                description: true,
                quantity: true,
                baseQuantity: true,
                reservedQuantity: true,
                issuedQuantity: true,
                unitPrice: true,
                lineTotal: true,
                integrationStatus: true,
                salesUom: { select: { code: true } },
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        customerId: true,
                        customerName: true,
                        customerEmail: true,
                        shipToName: true,
                        shipToPhone: true,
                        divisionId: true,
                        currency: true,
                        createdAt: true,
                        approvedAt: true,
                    },
                },
            },
            orderBy: [
                { salesOrder: { createdAt: 'asc' } },
                { lineNumber: 'asc' },
            ],
        })

        const open = lines
            .map((line) => ({ line, openQty: openQuantity(line) }))
            .filter(({ openQty }) => openQty > 0)

        const [etaByMaterial, customerCodes] = await Promise.all([
            this.restockEtas(open.map(({ line }) => line.materialId)),
            this.customerCodes(
                open.map(({ line }) => line.salesOrder.customerId),
            ),
        ])

        const rows = open.map(({ line, openQty }) => {
            const order = line.salesOrder
            const orderedQty = Number(line.quantity)
            const unitPrice =
                line.unitPrice != null
                    ? Number(line.unitPrice)
                    : line.lineTotal != null && orderedQty > 0
                      ? Number(line.lineTotal) / orderedQty
                      : 0
            const orderDate = order.approvedAt ?? order.createdAt
            const ageDays = Math.floor(
                (now.getTime() - orderDate.getTime()) / DAY_MS,
            )
            return {
                id: line.id,
                salesOrderId: order.id,
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                customerName:
                    order.customerName ??
                    order.shipToName ??
                    order.customerEmail ??
                    null,
                customerCode: customerCodes.get(order.customerId) ?? null,
                customerEmail: order.customerEmail,
                customerPhone: order.shipToPhone,
                divisionId: line.divisionId ?? order.divisionId,
                sku: line.productSkuSnapshot ?? line.sku,
                productName:
                    line.productNameSnapshot ??
                    line.description ??
                    line.sku ??
                    'Item',
                uom: line.salesUom?.code ?? null,
                orderedQty,
                openQty,
                openValue: Math.round(openQty * unitPrice * 100) / 100,
                currency: order.currency,
                orderDate,
                ageDays,
                critical: ageDays > CRITICAL_AGE_DAYS,
                reason: backorderReason(line),
                expectedRestockDate: line.materialId
                    ? (etaByMaterial.get(line.materialId) ?? null)
                    : null,
            }
        })

        const customers = new Map<string, string>()
        const divisions = new Set<string>()
        for (const row of rows) {
            customers.set(row.customerId, row.customerName ?? row.customerId)
            if (row.divisionId) divisions.add(row.divisionId)
        }

        const filtered = rows.filter(
            (row) =>
                (!query.customerId || row.customerId === query.customerId) &&
                (!query.divisionId || row.divisionId === query.divisionId),
        )
        const skip = (page - 1) * pageSize

        return {
            data: filtered.slice(skip, skip + pageSize),
            total: filtered.length,
            page,
            pageSize,
            summary: {
                totalBackorderedValue:
                    Math.round(
                        filtered.reduce((sum, row) => sum + row.openValue, 0) *
                            100,
                    ) / 100,
                affectedOrders: new Set(filtered.map((row) => row.salesOrderId))
                    .size,
                criticalShortages: filtered.filter((row) => row.critical)
                    .length,
                currency: 'PHP',
            },
            filters: {
                customers: [...customers.entries()]
                    .map(([id, name]) => ({ id, name }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                divisions: [...divisions].sort(),
            },
        }
    }

    /** Earliest expected delivery of open incoming PO quantity per material. */
    private async restockEtas(materialIds: Array<string | null>) {
        const ids = [
            ...new Set(materialIds.filter((id): id is string => Boolean(id))),
        ]
        const etas = new Map<string, Date>()
        if (ids.length === 0) return etas
        const poLines = await this.prisma.mmPurchaseOrderLine.findMany({
            where: {
                materialId: { in: ids },
                purchaseOrder: { status: { in: INCOMING_PO_STATUSES } },
            },
            select: {
                materialId: true,
                quantity: true,
                receivedQuantity: true,
                expectedDeliveryDate: true,
                purchaseOrder: { select: { expectedDeliveryDate: true } },
            },
        })
        for (const line of poLines) {
            if (new Decimal(line.receivedQuantity).gte(line.quantity)) continue
            const eta =
                line.expectedDeliveryDate ??
                line.purchaseOrder.expectedDeliveryDate
            if (!eta) continue
            const current = etas.get(line.materialId)
            if (!current || eta < current) etas.set(line.materialId, eta)
        }
        return etas
    }

    private async customerCodes(customerIds: string[]) {
        const ids = [...new Set(customerIds)]
        if (ids.length === 0) return new Map<string, string>()
        const rows = await this.prisma.sdCustomer.findMany({
            where: { id: { in: ids } },
            select: { id: true, customerNumber: true },
        })
        return new Map(rows.map((row) => [row.id, row.customerNumber]))
    }
}
