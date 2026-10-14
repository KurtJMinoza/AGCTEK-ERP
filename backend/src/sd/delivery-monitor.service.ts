import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { ListDeliveriesQueryDto } from './dto/delivery.dto'

export const DELIVERY_STAGES = ['PENDING_PICK', 'PICKING', 'PACKED', 'SHIPPED'] as const
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]

/** Where the SD team goes next; every step is executed by MM, never written here. */
export type DeliveryNextAction =
    | 'RELEASE_TO_WAREHOUSE'
    | 'PICK'
    | 'PACK'
    | 'POST_GOODS_ISSUE'
    | null

const SHIPPED_ORDER_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED']
const DELIVERY_ORDER_STATUSES = ['CONFIRMED', ...SHIPPED_ORDER_STATUSES]
const PACKED_PACKAGE_STATUSES = ['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED']

type QtyLike = Decimal | number | string

export type DeliverySignals = {
    orderStatus: string
    shippedAt: Date | null
    pickingTasks: Array<{ status: string; requiredQty: QtyLike; pickedQty: QtyLike }>
    packingSessions: Array<{ status: string }>
    packages: Array<{ status: string }>
    goodsIssues: Array<{ status: string }>
}

/**
 * Read model over MM warehouse execution. SHIPPED also trusts the order's own
 * milestones, which the goods-issue event listener sets.
 */
export function deriveDeliveryStage(signals: DeliverySignals): {
    stage: DeliveryStage
    nextAction: DeliveryNextAction
    requiredQty: number
    pickedQty: number
} {
    const tasks = signals.pickingTasks
    const requiredQty = tasks.reduce((sum, t) => sum + Number(t.requiredQty), 0)
    const pickedQty = tasks.reduce((sum, t) => sum + Number(t.pickedQty), 0)
    const qty = { requiredQty, pickedQty }

    if (
        SHIPPED_ORDER_STATUSES.includes(signals.orderStatus) ||
        signals.shippedAt ||
        signals.goodsIssues.some((gi) => gi.status === 'POSTED')
    ) {
        return { stage: 'SHIPPED', nextAction: null, ...qty }
    }
    if (
        signals.packingSessions.some((s) => s.status === 'COMPLETED') ||
        signals.packages.some((p) => PACKED_PACKAGE_STATUSES.includes(p.status))
    ) {
        return { stage: 'PACKED', nextAction: 'POST_GOODS_ISSUE', ...qty }
    }
    if (tasks.length === 0) {
        return {
            stage: 'PENDING_PICK',
            nextAction: signals.orderStatus === 'CONFIRMED' ? 'RELEASE_TO_WAREHOUSE' : null,
            ...qty,
        }
    }

    const started =
        tasks.some((t) => Number(t.pickedQty) > 0 || t.status === 'COMPLETED') ||
        signals.packingSessions.some((s) => s.status === 'OPEN')
    if (!started) return { stage: 'PENDING_PICK', nextAction: 'PICK', ...qty }

    const fullyPicked = tasks.every(
        (t) => Number(t.pickedQty) >= Number(t.requiredQty),
    )
    return { stage: 'PICKING', nextAction: fullyPicked ? 'PACK' : 'PICK', ...qty }
}

/** SO-000123 → DLV-000123; the delivery is identified by its sales order. */
export const toDeliveryNumber = (orderNumber: string) =>
    /^SO-/i.test(orderNumber)
        ? orderNumber.replace(/^SO-/i, 'DLV-')
        : `DLV-${orderNumber}`

const ORDER_SELECT = {
    id: true,
    orderNumber: true,
    customerName: true,
    customerEmail: true,
    shipToName: true,
    channel: true,
    status: true,
    createdAt: true,
    approvedAt: true,
    shippedAt: true,
    deliveredAt: true,
} satisfies Prisma.SdSalesOrderSelect

type OrderRow = Prisma.SdSalesOrderGetPayload<{ select: typeof ORDER_SELECT }>

@Injectable()
export class DeliveryMonitorService {
    constructor(private prisma: PrismaService) {}

    async list(query: ListDeliveriesQueryDto) {
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
        const search = query.search?.trim()

        const base: Prisma.SdSalesOrderWhereInput = {
            channel: { not: 'POS' },
            status: { in: DELIVERY_ORDER_STATUSES },
            ...(search
                ? {
                      OR: [
                          { orderNumber: { contains: search, mode: 'insensitive' } },
                          { customerName: { contains: search, mode: 'insensitive' } },
                          { customerEmail: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        const postedIds = await this.ordersWithPostedGoodsIssue()
        const shippedWhere: Prisma.SdSalesOrderWhereInput = {
            AND: [
                base,
                {
                    OR: [
                        { status: { in: SHIPPED_ORDER_STATUSES } },
                        { shippedAt: { not: null } },
                        { id: { in: postedIds } },
                    ],
                },
            ],
        }
        const openWhere: Prisma.SdSalesOrderWhereInput = {
            AND: [base, { status: 'CONFIRMED', shippedAt: null, id: { notIn: postedIds } }],
        }

        // Open deliveries need MM signals to stage them, so they are staged in full;
        // shipped ones are settled and paginate in the database.
        const [openOrders, shippedCount] = await Promise.all([
            this.prisma.sdSalesOrder.findMany({
                where: openWhere,
                select: ORDER_SELECT,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.sdSalesOrder.count({ where: shippedWhere }),
        ])
        const openRows = await this.toRows(openOrders)
        const summary: Record<DeliveryStage, number> = {
            PENDING_PICK: 0,
            PICKING: 0,
            PACKED: 0,
            SHIPPED: shippedCount,
        }
        for (const row of openRows) summary[row.stage] += 1

        const skip = (page - 1) * pageSize
        if (query.stage && query.stage !== 'SHIPPED') {
            const matching = openRows.filter((row) => row.stage === query.stage)
            return {
                data: matching.slice(skip, skip + pageSize),
                total: matching.length,
                page,
                pageSize,
                summary,
            }
        }

        const where = query.stage === 'SHIPPED' ? shippedWhere : base
        const [orders, total] = await Promise.all([
            this.prisma.sdSalesOrder.findMany({
                where,
                select: ORDER_SELECT,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.sdSalesOrder.count({ where }),
        ])
        return { data: await this.toRows(orders), total, page, pageSize, summary }
    }

    async findOne(salesOrderId: string) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: {
                ...ORDER_SELECT,
                shipToPhone: true,
                shipToAddressLine1: true,
                shipToCity: true,
                shipToRegion: true,
                shipToPostalCode: true,
                shipToCountry: true,
                courierName: true,
                trackingNumber: true,
                warehouse: { select: { code: true, name: true } },
                fulfillments: {
                    select: { warehouse: { select: { id: true, code: true, name: true } } },
                },
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    select: {
                        id: true,
                        lineNumber: true,
                        productNameSnapshot: true,
                        description: true,
                        sku: true,
                        productSkuSnapshot: true,
                        variantName: true,
                        divisionId: true,
                        quantity: true,
                        issuedQuantity: true,
                        salesUom: { select: { code: true } },
                    },
                },
            },
        })
        if (!order || !DELIVERY_ORDER_STATUSES.includes(order.status)) {
            throw new NotFoundException('Delivery not found')
        }

        const signals = await this.loadSignals([order.id])
        const mine = <T extends { salesOrderId: string | null }>(rows: T[]) =>
            rows.filter((row) => row.salesOrderId === order.id)
        const pickingTasks = mine(signals.pickingTasks)
        const derived = deriveDeliveryStage({
            orderStatus: order.status,
            shippedAt: order.shippedAt,
            pickingTasks,
            packingSessions: mine(signals.packingSessions),
            packages: mine(signals.packages),
            goodsIssues: signals.goodsIssues.filter((gi) => gi.sourceDocumentId === order.id),
        })

        const warehouses = new Map<string, { code: string; name: string }>()
        for (const f of order.fulfillments) warehouses.set(f.warehouse.id, f.warehouse)

        return {
            salesOrderId: order.id,
            deliveryNumber: toDeliveryNumber(order.orderNumber),
            salesOrderReference: order.orderNumber,
            customerName: this.customerName(order),
            customerEmail: order.customerEmail,
            channel: order.channel,
            orderStatus: order.status,
            createdAt: order.createdAt,
            approvedAt: order.approvedAt,
            shippedAt: order.shippedAt,
            deliveredAt: order.deliveredAt,
            ...derived,
            shipTo: {
                name: order.shipToName ?? order.customerName,
                phone: order.shipToPhone,
                addressLine1: order.shipToAddressLine1,
                city: order.shipToCity,
                region: order.shipToRegion,
                postalCode: order.shipToPostalCode,
                country: order.shipToCountry,
            },
            courierName: order.courierName,
            trackingNumber: order.trackingNumber,
            warehouses: warehouses.size
                ? [...warehouses.values()]
                : order.warehouse
                  ? [order.warehouse]
                  : [],
            lines: order.lines.map((line) => {
                const tasks = pickingTasks.filter((t) => t.salesOrderLineId === line.id)
                return {
                    id: line.id,
                    lineNumber: line.lineNumber,
                    name:
                        line.productNameSnapshot ?? line.description ?? line.sku ?? 'Item',
                    sku: line.productSkuSnapshot ?? line.sku,
                    variantName: line.variantName,
                    divisionId: line.divisionId,
                    quantity: Number(line.quantity),
                    uom: line.salesUom?.code ?? null,
                    pickRequiredQty: tasks.reduce((s, t) => s + Number(t.requiredQty), 0),
                    pickedQty: tasks.reduce((s, t) => s + Number(t.pickedQty), 0),
                    issuedQty: Number(line.issuedQuantity),
                }
            }),
            documents: {
                pickingTasks: pickingTasks.map((t) => ({
                    number: t.taskNumber,
                    status: t.status,
                })),
                packages: mine(signals.packages).map((p) => ({
                    number: p.packageNumber,
                    status: p.status,
                })),
                goodsIssues: signals.goodsIssues
                    .filter((gi) => gi.sourceDocumentId === order.id)
                    .map((gi) => ({ number: gi.documentNumber, status: gi.status })),
            },
        }
    }

    private customerName(order: Pick<OrderRow, 'customerName' | 'shipToName' | 'customerEmail'>) {
        return order.customerName ?? order.shipToName ?? order.customerEmail ?? null
    }

    private async ordersWithPostedGoodsIssue() {
        const rows = await this.prisma.mmGoodsIssue.findMany({
            where: {
                sourceDocumentType: 'SALES_ORDER',
                status: 'POSTED',
                sourceDocumentId: { not: null },
            },
            select: { sourceDocumentId: true },
            distinct: ['sourceDocumentId'],
        })
        return rows.map((row) => row.sourceDocumentId as string)
    }

    private async loadSignals(orderIds: string[]) {
        if (orderIds.length === 0) {
            return { pickingTasks: [], packingSessions: [], packages: [], goodsIssues: [] }
        }
        const [pickingTasks, packingSessions, packages, goodsIssues] = await Promise.all([
            this.prisma.wmPickingTask.findMany({
                where: { salesOrderId: { in: orderIds }, status: { not: 'CANCELLED' } },
                select: {
                    salesOrderId: true,
                    salesOrderLineId: true,
                    taskNumber: true,
                    status: true,
                    requiredQty: true,
                    pickedQty: true,
                },
            }),
            this.prisma.wmPackingSession.findMany({
                where: { salesOrderId: { in: orderIds }, status: { not: 'CANCELLED' } },
                select: { salesOrderId: true, status: true },
            }),
            this.prisma.wmPackage.findMany({
                where: { salesOrderId: { in: orderIds } },
                select: { salesOrderId: true, packageNumber: true, status: true },
            }),
            this.prisma.mmGoodsIssue.findMany({
                where: {
                    sourceDocumentType: 'SALES_ORDER',
                    sourceDocumentId: { in: orderIds },
                    status: { not: 'CANCELLED' },
                },
                select: { sourceDocumentId: true, documentNumber: true, status: true },
            }),
        ])
        return { pickingTasks, packingSessions, packages, goodsIssues }
    }

    private async toRows(orders: OrderRow[]) {
        const signals = await this.loadSignals(orders.map((o) => o.id))
        return orders.map((order) => {
            const forOrder = <T extends { salesOrderId: string | null }>(rows: T[]) =>
                rows.filter((row) => row.salesOrderId === order.id)
            const derived = deriveDeliveryStage({
                orderStatus: order.status,
                shippedAt: order.shippedAt,
                pickingTasks: forOrder(signals.pickingTasks),
                packingSessions: forOrder(signals.packingSessions),
                packages: forOrder(signals.packages),
                goodsIssues: signals.goodsIssues.filter(
                    (gi) => gi.sourceDocumentId === order.id,
                ),
            })
            return {
                salesOrderId: order.id,
                deliveryNumber: toDeliveryNumber(order.orderNumber),
                salesOrderReference: order.orderNumber,
                customerName: this.customerName(order),
                channel: order.channel,
                orderStatus: order.status,
                createdAt: order.createdAt,
                shippedAt: order.shippedAt,
                ...derived,
            }
        })
    }
}
