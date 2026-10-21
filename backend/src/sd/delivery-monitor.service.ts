import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { ListDeliveriesQueryDto } from './dto/delivery.dto'

export const DELIVERY_STAGES = [
    'PENDING_PICK',
    'PICKING',
    'PACKED',
    'SHIPPED',
] as const
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]

/**
 * Where the SD team goes next. Pick / pack / release are MM screens.
 * Goods Issue is never triggered from SD — Auto-GI posts via the MM fulfillment
 * listener (`sd-fulfillment-events.listener.ts`).
 */
export type DeliveryNextAction = 'RELEASE_TO_WAREHOUSE' | 'PICK' | 'PACK' | null

const SHIPPED_ORDER_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED']
const DELIVERY_ORDER_STATUSES = ['CONFIRMED', ...SHIPPED_ORDER_STATUSES]
const PACKED_PACKAGE_STATUSES = ['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED']

type QtyLike = Decimal | number | string

export type DeliverySignals = {
    orderStatus: string
    shippedAt: Date | null
    pickingTasks: Array<{
        status: string
        requiredQty: QtyLike
        pickedQty: QtyLike
    }>
    packingSessions: Array<{ status: string }>
    packages: Array<{ status: string }>
    goodsIssues: Array<{ status: string }>
}

/**
 * Read model over MM warehouse execution. SHIPPED also trusts the order's own
 * milestones, which the goods-issue event listener sets.
 * PACKED means waiting for automated Goods Issue (no SD next-action).
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
        signals.packages.some((p) =>
            PACKED_PACKAGE_STATUSES.includes(p.status),
        ) ||
        signals.goodsIssues.some((gi) => gi.status === 'DRAFT')
    ) {
        return { stage: 'PACKED', nextAction: null, ...qty }
    }
    if (tasks.length === 0) {
        return {
            stage: 'PENDING_PICK',
            nextAction:
                signals.orderStatus === 'CONFIRMED'
                    ? 'RELEASE_TO_WAREHOUSE'
                    : null,
            ...qty,
        }
    }

    const started =
        tasks.some(
            (t) => Number(t.pickedQty) > 0 || t.status === 'COMPLETED',
        ) || signals.packingSessions.some((s) => s.status === 'OPEN')
    if (!started) return { stage: 'PENDING_PICK', nextAction: 'PICK', ...qty }

    const fullyPicked = tasks.every(
        (t) => Number(t.pickedQty) >= Number(t.requiredQty),
    )
    return {
        stage: 'PICKING',
        nextAction: fullyPicked ? 'PACK' : 'PICK',
        ...qty,
    }
}

/** SO-000123 → DLV-000123; the delivery is identified by its sales order. */
export const toDeliveryNumber = (orderNumber: string) =>
    /^SO-/i.test(orderNumber)
        ? orderNumber.replace(/^SO-/i, 'DLV-')
        : `DLV-${orderNumber}`

const LINE_LIST_SELECT = {
    id: true,
    lineNumber: true,
    productNameSnapshot: true,
    description: true,
    sku: true,
    productSkuSnapshot: true,
    unitPrice: true,
    lineTotal: true,
    quantity: true,
} satisfies Prisma.SdSalesOrderLineSelect

const ORDER_SELECT = {
    id: true,
    orderNumber: true,
    customerId: true,
    customerName: true,
    customerEmail: true,
    shipToName: true,
    channel: true,
    currency: true,
    totalAmount: true,
    status: true,
    createdAt: true,
    approvedAt: true,
    shippedAt: true,
    deliveredAt: true,
    lines: {
        orderBy: { lineNumber: 'asc' as const },
        select: LINE_LIST_SELECT,
    },
} satisfies Prisma.SdSalesOrderSelect

type OrderRow = Prisma.SdSalesOrderGetPayload<{ select: typeof ORDER_SELECT }>
type OrderLineRow = OrderRow['lines'][number]

type CustomerRef = {
    id: string
    customerNumber: string
    companyName: string
}

@Injectable()
export class DeliveryMonitorService {
    constructor(private prisma: PrismaService) {}

    async list(query: ListDeliveriesQueryDto) {
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(
            100,
            Math.max(1, Number(query.pageSize) || 20),
        )
        const search = query.search?.trim()
        const searchFilter = search
            ? await this.buildSearchFilter(search)
            : null

        const base: Prisma.SdSalesOrderWhereInput = {
            channel: { not: 'POS' },
            status: { in: DELIVERY_ORDER_STATUSES },
            ...(searchFilter ? { OR: searchFilter } : {}),
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
            AND: [
                base,
                {
                    status: 'CONFIRMED',
                    shippedAt: null,
                    id: { notIn: postedIds },
                },
            ],
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
        return {
            data: await this.toRows(orders),
            total,
            page,
            pageSize,
            summary,
        }
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
                    select: {
                        warehouse: {
                            select: { id: true, code: true, name: true },
                        },
                    },
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
                        unitPrice: true,
                        lineTotal: true,
                        issuedQuantity: true,
                        salesUom: { select: { code: true } },
                    },
                },
            },
        })
        if (!order || !DELIVERY_ORDER_STATUSES.includes(order.status)) {
            throw new NotFoundException('Delivery not found')
        }

        const [signals, customers] = await Promise.all([
            this.loadSignals([order.id]),
            this.loadCustomers([order.customerId]),
        ])
        const customer = customers.get(order.customerId)
        const mine = <T extends { salesOrderId: string | null }>(rows: T[]) =>
            rows.filter((row) => row.salesOrderId === order.id)
        const pickingTasks = mine(signals.pickingTasks)
        const derived = deriveDeliveryStage({
            orderStatus: order.status,
            shippedAt: order.shippedAt,
            pickingTasks,
            packingSessions: mine(signals.packingSessions),
            packages: mine(signals.packages),
            goodsIssues: signals.goodsIssues.filter(
                (gi) => gi.sourceDocumentId === order.id,
            ),
        })

        const warehouses = new Map<string, { code: string; name: string }>()
        for (const f of order.fulfillments)
            warehouses.set(f.warehouse.id, f.warehouse)
        const commercial = this.commercialSummary(
            order.lines,
            order.totalAmount,
        )

        return {
            salesOrderId: order.id,
            deliveryNumber: toDeliveryNumber(order.orderNumber),
            salesOrderReference: order.orderNumber,
            customerName: this.customerName(order, customer),
            customerCode: customer?.customerNumber ?? null,
            customerEmail: order.customerEmail,
            channel: order.channel,
            currency: order.currency,
            totalAmount: commercial.totalAmount,
            primaryProductName: commercial.primaryProductName,
            primarySku: commercial.primarySku,
            extraItemCount: commercial.extraItemCount,
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
                const tasks = pickingTasks.filter(
                    (t) => t.salesOrderLineId === line.id,
                )
                return {
                    id: line.id,
                    lineNumber: line.lineNumber,
                    name:
                        line.productNameSnapshot ??
                        line.description ??
                        line.sku ??
                        'Item',
                    sku: line.productSkuSnapshot ?? line.sku,
                    variantName: line.variantName,
                    divisionId: line.divisionId,
                    quantity: Number(line.quantity),
                    unitPrice:
                        line.unitPrice != null ? Number(line.unitPrice) : null,
                    totalAmount:
                        line.lineTotal != null ? Number(line.lineTotal) : null,
                    uom: line.salesUom?.code ?? null,
                    pickRequiredQty: tasks.reduce(
                        (s, t) => s + Number(t.requiredQty),
                        0,
                    ),
                    pickedQty: tasks.reduce(
                        (s, t) => s + Number(t.pickedQty),
                        0,
                    ),
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
                    .map((gi) => ({
                        number: gi.documentNumber,
                        status: gi.status,
                    })),
            },
        }
    }

    private customerName(
        order: Pick<OrderRow, 'customerName' | 'shipToName' | 'customerEmail'>,
        customer?: CustomerRef | null,
    ) {
        return (
            order.customerName ??
            customer?.companyName ??
            order.shipToName ??
            order.customerEmail ??
            null
        )
    }

    private commercialSummary(
        lines: OrderLineRow[],
        headerTotal: QtyLike | null | undefined,
    ) {
        const primary = lines[0]
        const lineSum = lines.reduce(
            (sum, line) =>
                sum +
                (line.lineTotal != null
                    ? Number(line.lineTotal)
                    : Number(line.unitPrice ?? 0) * Number(line.quantity)),
            0,
        )
        return {
            primaryProductName: primary
                ? (primary.productNameSnapshot ??
                  primary.description ??
                  primary.sku ??
                  'Item')
                : null,
            primarySku: primary
                ? (primary.productSkuSnapshot ?? primary.sku ?? null)
                : null,
            extraItemCount: Math.max(0, lines.length - 1),
            totalAmount:
                headerTotal != null && headerTotal !== ''
                    ? Number(headerTotal)
                    : lineSum,
        }
    }

    private async buildSearchFilter(
        search: string,
    ): Promise<Prisma.SdSalesOrderWhereInput[]> {
        const mode = 'insensitive' as const
        const customerMatches = await this.prisma.sdCustomer.findMany({
            where: {
                OR: [
                    { customerNumber: { contains: search, mode } },
                    { companyName: { contains: search, mode } },
                    { contactName: { contains: search, mode } },
                ],
            },
            select: { id: true },
            take: 50,
        })
        return [
            { orderNumber: { contains: search, mode } },
            { customerName: { contains: search, mode } },
            { customerEmail: { contains: search, mode } },
            { customerId: { in: customerMatches.map((c) => c.id) } },
            {
                lines: {
                    some: {
                        OR: [
                            { sku: { contains: search, mode } },
                            { productSkuSnapshot: { contains: search, mode } },
                            { productNameSnapshot: { contains: search, mode } },
                            { description: { contains: search, mode } },
                            { variantSku: { contains: search, mode } },
                        ],
                    },
                },
            },
        ]
    }

    private async loadCustomers(customerIds: string[]) {
        const ids = [...new Set(customerIds.filter(Boolean))]
        if (ids.length === 0) return new Map<string, CustomerRef>()
        const rows = await this.prisma.sdCustomer.findMany({
            where: { id: { in: ids } },
            select: { id: true, customerNumber: true, companyName: true },
        })
        return new Map(rows.map((row) => [row.id, row]))
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
            return {
                pickingTasks: [],
                packingSessions: [],
                packages: [],
                goodsIssues: [],
            }
        }
        const [pickingTasks, packingSessions, packages, goodsIssues] =
            await Promise.all([
                this.prisma.wmPickingTask.findMany({
                    where: {
                        salesOrderId: { in: orderIds },
                        status: { not: 'CANCELLED' },
                    },
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
                    where: {
                        salesOrderId: { in: orderIds },
                        status: { not: 'CANCELLED' },
                    },
                    select: { salesOrderId: true, status: true },
                }),
                this.prisma.wmPackage.findMany({
                    where: { salesOrderId: { in: orderIds } },
                    select: {
                        salesOrderId: true,
                        packageNumber: true,
                        status: true,
                    },
                }),
                this.prisma.mmGoodsIssue.findMany({
                    where: {
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: { in: orderIds },
                        status: { not: 'CANCELLED' },
                    },
                    select: {
                        sourceDocumentId: true,
                        documentNumber: true,
                        status: true,
                    },
                }),
            ])
        return { pickingTasks, packingSessions, packages, goodsIssues }
    }

    private async toRows(orders: OrderRow[]) {
        const [signals, customers] = await Promise.all([
            this.loadSignals(orders.map((o) => o.id)),
            this.loadCustomers(orders.map((o) => o.customerId)),
        ])
        return orders.map((order) => {
            const forOrder = <T extends { salesOrderId: string | null }>(
                rows: T[],
            ) => rows.filter((row) => row.salesOrderId === order.id)
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
            const customer = customers.get(order.customerId)
            const commercial = this.commercialSummary(
                order.lines,
                order.totalAmount,
            )
            return {
                salesOrderId: order.id,
                deliveryNumber: toDeliveryNumber(order.orderNumber),
                salesOrderReference: order.orderNumber,
                customerName: this.customerName(order, customer),
                customerCode: customer?.customerNumber ?? null,
                channel: order.channel,
                currency: order.currency,
                totalAmount: commercial.totalAmount,
                primaryProductName: commercial.primaryProductName,
                primarySku: commercial.primarySku,
                extraItemCount: commercial.extraItemCount,
                orderStatus: order.status,
                createdAt: order.createdAt,
                shippedAt: order.shippedAt,
                ...derived,
            }
        })
    }
}
