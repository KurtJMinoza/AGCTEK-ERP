import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from '../permissions/permissions.service'
import { CustomerReturnService } from '../mm/returns-disposal/customer-return.service'
import { CreateSalesReturnDto } from './dto/sales-return.dto'

export const SALES_RETURN_STATUS = {
    REQUESTED: 'REQUESTED',
    AUTHORIZED: 'AUTHORIZED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
} as const
export type SalesReturnStatus =
    (typeof SALES_RETURN_STATUS)[keyof typeof SALES_RETURN_STATUS]

/**
 * Customer's commercial choice on a REQUESTED return. The driver never picks this; SD does.
 * KEEP_AND_PAY_FULL rejects the return (no credit, no MM); both credit options authorize it,
 * and only CREDIT_AND_RETURN may open an MM intake.
 */
export const SALES_RETURN_SETTLEMENT = {
    KEEP_AND_PAY_FULL: 'KEEP_AND_PAY_FULL',
    CREDIT_AND_RETURN: 'CREDIT_AND_RETURN',
    CREDIT_NO_RETURN: 'CREDIT_NO_RETURN',
} as const
export type SalesReturnSettlement =
    (typeof SALES_RETURN_SETTLEMENT)[keyof typeof SALES_RETURN_SETTLEMENT]

export function parseSettlement(value: unknown): SalesReturnSettlement {
    if (
        typeof value === 'string' &&
        (Object.values(SALES_RETURN_SETTLEMENT) as string[]).includes(value)
    ) {
        return value as SalesReturnSettlement
    }
    throw new BadRequestException(
        `settlement must be one of ${Object.values(SALES_RETURN_SETTLEMENT).join(', ')}`,
    )
}

/**
 * Credit intent for the returned qty at the order-line price (unitPrice, else lineTotal/qty).
 * Null when any line has no price — the amount is then left for billing to decide.
 */
export function creditAmountForLines(
    returnLines: Array<{ salesOrderLineId: string; quantity: Decimal }>,
    orderLines: Array<{
        id: string
        unitPrice: Decimal | null
        lineTotal: Decimal | null
        quantity: Decimal
    }>,
): Decimal | null {
    let total = new Decimal(0)
    for (const line of returnLines) {
        const orderLine = orderLines.find((l) => l.id === line.salesOrderLineId)
        if (!orderLine) return null
        const unit =
            orderLine.unitPrice ??
            (orderLine.lineTotal && orderLine.quantity.gt(0)
                ? orderLine.lineTotal.div(orderLine.quantity)
                : null)
        if (unit === null) return null
        total = total.plus(unit.mul(line.quantity))
    }
    return total.toDecimalPlaces(2)
}

/** A damaged-delivery return needs a confirmed order that is not draft/cancelled — damage is found in transit (SHIPPED) or at the door (DELIVERED). */
export const RETURNABLE_ORDER_STATUSES: ReadonlySet<string> = new Set([
    'CONFIRMED',
    'SHIPPED',
    'DELIVERED',
    'COMPLETED',
])

const ACTIVE_RETURN_STATUSES: ReadonlySet<string> = new Set([
    SALES_RETURN_STATUS.REQUESTED,
    SALES_RETURN_STATUS.AUTHORIZED,
])

type PrismaClientLike = PrismaService | Prisma.TransactionClient

type SalesReturnActor = { id: string; userName?: string; role: string }
type SalesReturnLineInput = {
    salesOrderLineId: string
    materialId?: string
    quantity: number | Decimal
}

/** Per-line physical intake details supplied when the SD return opens the MM intake. */
export type InitiateMmIntakeInput = {
    warehouseId?: string
    remarks?: string
    lines?: Array<{
        salesReturnLineId: string
        batchId?: string | null
        serialNumberId?: string | null
        storageBinId?: string | null
        unitCost?: number
    }>
}

const returnInclude = {
    lines: { orderBy: { lineNumber: 'asc' as const } },
    audits: { orderBy: { performedAt: 'asc' as const } },
    salesOrder: {
        select: {
            id: true,
            orderNumber: true,
            status: true,
            channel: true,
            source: true,
            createdAt: true,
        },
    },
    customer: {
        select: {
            id: true,
            customerNumber: true,
            companyName: true,
            contactName: true,
        },
    },
    /** SCM damage report that originated this return (Phase 5 traceability). */
    damageReport: {
        select: {
            id: true,
            reference: true,
            shipmentId: true,
            status: true,
            source: true,
        },
    },
    /** MM intake opened from this return, once handed off (Phase 4/5 traceability). */
    customerReturn: {
        select: {
            id: true,
            returnNumber: true,
            status: true,
        },
    },
} satisfies Prisma.SdSalesReturnInclude

/**
 * SD Sales Return (customer return integration — Phase 3). SD owns the commercial return
 * document; the SCM damage report and the future MM intake reference it, never the reverse.
 *
 * Guardrails enforced here:
 * - Creating a return is NOT authorizing it — new returns are REQUESTED and only an explicit
 *   authorize() may move them to AUTHORIZED (Phase 4 opens the MM intake from AUTHORIZED).
 * - Only confirmed, shipped, delivered or completed orders are returnable.
 * - Every line must reference a real order line of that order, and materialId (when supplied)
 *   must match it — material matching alone never selects an arbitrary line.
 * - Returnable quantity is enforced atomically: order lines are row-locked (FOR UPDATE) inside
 *   the transaction and prior valid returns are subtracted before insertion.
 * - A unique `damageReportId` means a handoff retry can never create a second return.
 * - No inventory posting, credit memo, or FICO effect is created here (Phase 3 boundary).
 */
@Injectable()
export class SalesReturnService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissions: PermissionsService,
        private readonly customerReturns: CustomerReturnService,
    ) {}

    /**
     * Create a return DTO. `opts.tx` lets the SCM handoff run creation inside its own
     * transaction (`damageReportId` uniqueness + report linkage commit together).
     */
    async create(
        input: CreateSalesReturnDto,
        actor: SalesReturnActor,
        opts: { tx?: Prisma.TransactionClient } = {},
    ) {
        await this.assertCreatePermission(actor)
        const client = opts.tx ?? this.prisma
        if (opts.tx) {
            return this.createIn(client, input, actor)
        }
        return this.prisma.$transaction((tx) => this.createIn(tx, input, actor))
    }

    async list(query: {
        companyId?: string
        status?: string
        salesOrderId?: string
        page?: number
        pageSize?: number
    }) {
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(
            100,
            Math.max(1, Number(query.pageSize) || 20),
        )
        const where: Prisma.SdSalesReturnWhereInput = {
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.sdSalesReturn.findMany({
                where,
                include: returnInclude,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.sdSalesReturn.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const row = await this.prisma.sdSalesReturn.findUnique({
            where: { id },
            include: returnInclude,
        })
        if (!row) throw new NotFoundException('Sales return not found')
        return row
    }

    /** REQUESTED → AUTHORIZED. Separate from creation on purpose (guardrail 1). */
    async authorize(id: string, actor: SalesReturnActor) {
        return this.transition(
            id,
            actor,
            SALES_RETURN_STATUS.REQUESTED,
            SALES_RETURN_STATUS.AUTHORIZED,
            {
                authorizedBy: actor.id,
                authorizedAt: new Date(),
            },
        )
    }

    /** REQUESTED → REJECTED (with an optional reason). */
    async reject(
        id: string,
        input: { reason?: string },
        actor: SalesReturnActor,
    ) {
        return this.transition(
            id,
            actor,
            SALES_RETURN_STATUS.REQUESTED,
            SALES_RETURN_STATUS.REJECTED,
            {
                rejectedBy: actor.id,
                rejectedAt: new Date(),
                rejectReason: input.reason?.trim() || null,
            },
        )
    }

    /**
     * Records the customer's settlement and moves the REQUESTED return accordingly:
     * pay in full → REJECTED (credit 0); credit (with or without return) → AUTHORIZED with the
     * credit amount at order-line price. Credit memo / FICO posting is out of scope here.
     */
    async settle(
        id: string,
        input: { settlement?: string; note?: string },
        actor: SalesReturnActor,
    ) {
        const settlement = parseSettlement(input.settlement)
        const note = input.note?.trim() || null
        const now = new Date()
        const recorded = {
            settlement,
            settlementNote: note,
            settledBy: actor.id,
            settledAt: now,
        }
        if (settlement === SALES_RETURN_SETTLEMENT.KEEP_AND_PAY_FULL) {
            return this.transition(
                id,
                actor,
                SALES_RETURN_STATUS.REQUESTED,
                SALES_RETURN_STATUS.REJECTED,
                {
                    ...recorded,
                    creditAmount: new Decimal(0),
                    rejectedBy: actor.id,
                    rejectedAt: now,
                    rejectReason:
                        note ?? 'Customer keeps the goods and pays in full',
                },
                { settlement },
            )
        }
        const creditAmount = await this.creditAmountFor(id)
        return this.transition(
            id,
            actor,
            SALES_RETURN_STATUS.REQUESTED,
            SALES_RETURN_STATUS.AUTHORIZED,
            {
                ...recorded,
                creditAmount,
                authorizedBy: actor.id,
                authorizedAt: now,
            },
            { settlement, creditAmount: creditAmount?.toString() ?? null },
        )
    }

    /** REQUESTED or AUTHORIZED → CANCELLED (nothing was posted, so no reversal is needed). */
    async cancel(
        id: string,
        input: { reason?: string },
        actor: SalesReturnActor,
    ) {
        return this.transition(
            id,
            actor,
            [SALES_RETURN_STATUS.REQUESTED, SALES_RETURN_STATUS.AUTHORIZED],
            SALES_RETURN_STATUS.CANCELLED,
            {
                cancelBy: actor.id,
                cancelAt: new Date(),
                cancelReason: input.reason?.trim() || null,
            },
        )
    }

    /**
     * SCM damage report → SD sales return → MM customer return intake (Phase 4 handoff).
     *
     * Opens the MM intake through the MM-owned service — SD never writes MM tables, and SD never
     * posts inventory. Only an AUTHORIZED return may be intaken. The SD `update` permission is
     * asserted here (defense-in-depth; the controller also guards it). The MM service asserts the
     * intake permission and is idempotent on `sdSalesReturnId`, so a retry returns the existing
     * intake instead of creating a duplicate.
     */
    async initiateMmIntake(
        id: string,
        input: InitiateMmIntakeInput,
        actor: SalesReturnActor,
    ) {
        await this.permissions.assertPermission(
            { role: actor.role },
            'sd.sales-returns',
            'update',
        )
        const salesReturn = await this.findOne(id)
        if (salesReturn.status !== SALES_RETURN_STATUS.AUTHORIZED) {
            throw new ConflictException(
                `Only an AUTHORIZED sales return can open an MM intake (current: ${salesReturn.status})`,
            )
        }
        if (salesReturn.settlement === SALES_RETURN_SETTLEMENT.CREDIT_NO_RETURN) {
            throw new ConflictException(
                'This return was settled as credit without return; no goods come back to MM',
            )
        }
        const warehouseId = input.warehouseId ?? salesReturn.warehouseId
        if (!warehouseId) {
            throw new BadRequestException(
                'warehouseId is required: this sales return has no warehouse to receive the intake',
            )
        }

        const overrides = new Map(
            (input.lines ?? []).map((l) => [l.salesReturnLineId, l]),
        )
        const lines = salesReturn.lines.map((line) => {
            if (!line.materialId) {
                throw new BadRequestException(
                    `Sales return line ${line.lineNumber} has no material; resolve it before opening the intake`,
                )
            }
            const override = overrides.get(line.id)
            return {
                materialId: line.materialId,
                uomId: line.uomId,
                quantity: Number(line.quantity),
                unitCost: override?.unitCost,
                batchId: override?.batchId ?? null,
                serialNumberId: override?.serialNumberId ?? null,
                storageBinId: override?.storageBinId ?? null,
            }
        })

        const result = await this.customerReturns.createFromSalesReturn(
            {
                salesReturnId: id,
                companyId: salesReturn.companyId,
                warehouseId,
                damageReportId: salesReturn.damageReportId,
                customerName: salesReturn.customer?.companyName ?? null,
                customerRef: salesReturn.returnNumber,
                reason: salesReturn.reason,
                remarks: input.remarks,
                createdBy: actor.id,
                lines,
            },
            actor,
        )

        return {
            created: result.created,
            salesReturnNumber: salesReturn.returnNumber,
            customerReturn: result.customerReturn,
        }
    }

    private async createIn(
        client: PrismaClientLike,
        input: CreateSalesReturnDto,
        actor: SalesReturnActor,
    ) {
        const order = await this.loadReturnableOrder(client, input.salesOrderId)
        const companyId = await this.resolveCompany(
            client,
            order,
            input.companyId,
        )
        if (companyId !== order.companyId) {
            throw new BadRequestException(
                'companyId does not match the sales order',
            )
        }
        const customerId = await this.resolveCustomerId(client, order)

        const lineTargets = await Promise.all(
            input.lines.map(async (line) => {
                if (new Decimal(line.quantity).lte(0)) {
                    throw new BadRequestException(
                        'Return quantity must be positive',
                    )
                }
                const orderLine = order.lines.find(
                    (l) => l.id === line.salesOrderLineId,
                )
                if (!orderLine) {
                    throw new BadRequestException(
                        `Order line ${line.salesOrderLineId} does not belong to order ${order.orderNumber}`,
                    )
                }
                if (
                    line.materialId &&
                    line.materialId !== orderLine.materialId
                ) {
                    throw new BadRequestException(
                        `Order line ${orderLine.lineNumber} is material ${orderLine.materialId ?? 'unset'}, not ${line.materialId}`,
                    )
                }
                return { orderLine, requested: new Decimal(line.quantity) }
            }),
        )

        // Row-lock the order lines in a fixed order to serialize returnable-quantity checks.
        const sorted = [...lineTargets.map((t) => t.orderLine)].sort((a, b) =>
            a.id.localeCompare(b.id),
        )
        for (const orderLine of sorted) {
            const locked = await this.lockOrderLine(client, orderLine.id)
            if (!locked || locked.quantity === null) {
                throw new NotFoundException(
                    `Order line ${orderLine.id} not found`,
                )
            }
        }

        for (const target of lineTargets) {
            const returnable = await this.remainingReturnable(
                client,
                target.orderLine.id,
            )
            if (target.requested.gt(returnable)) {
                throw new ConflictException(
                    `Order line ${target.orderLine.lineNumber}: requested ${target.requested.toString()} exceeds the returnable quantity ${returnable.toString()}`,
                )
            }
        }

        const returnNumber = await this.nextReturnNumber(client)
        const audit = {
            action: 'CREATED',
            performedBy: actor.id,
            details: {
                reason: input.reason ?? null,
                damageReportId: input.damageReportId ?? null,
            },
        }
        const row = await client.sdSalesReturn.create({
            data: {
                returnNumber,
                companyId,
                salesOrderId: order.id,
                customerId,
                ...(input.damageReportId
                    ? { damageReportId: input.damageReportId }
                    : {}),
                reason: input.reason?.trim() || null,
                notes: input.notes?.trim() || null,
                status: SALES_RETURN_STATUS.REQUESTED,
                requestedBy: actor.id,
                requestedAt: new Date(),
                createdBy: actor.id,
                lines: {
                    create: lineTargets.map((target, index) => ({
                        lineNumber: index + 1,
                        salesOrderLineId: target.orderLine.id,
                        materialId: target.orderLine.materialId ?? null,
                        sku: target.orderLine.sku ?? null,
                        description: target.orderLine.description ?? null,
                        quantity: target.requested,
                        uomId: target.orderLine.salesUomId ?? null,
                    })),
                },
                audits: { create: audit },
            },
            include: returnInclude,
        })
        return row
    }

    /** Conditional state transition with an audit row; returns the refreshed document. */
    private async transition(
        id: string,
        actor: SalesReturnActor,
        from: SalesReturnStatus | readonly SalesReturnStatus[],
        to: SalesReturnStatus,
        stamps: Record<string, unknown>,
        auditDetails: Record<string, unknown> = {},
    ) {
        const fromList = Array.isArray(from) ? from : [from]
        await this.prisma.$transaction(async (tx) => {
            const result = await tx.sdSalesReturn.updateMany({
                where: { id, status: { in: [...fromList] } },
                data: { ...stamps, status: to, updatedBy: actor.id },
            })
            if (result.count === 0) {
                const current = await tx.sdSalesReturn.findUnique({
                    where: { id },
                    select: { status: true },
                })
                if (!current)
                    throw new NotFoundException('Sales return not found')
                if (current.status === to)
                    throw new ConflictException(`Sales return is already ${to}`)
                throw new ConflictException(
                    `Sales return cannot move from ${current.status} to ${to}`,
                )
            }
            await tx.sdSalesReturnAudit.create({
                data: {
                    salesReturnId: id,
                    action: to,
                    performedBy: actor.id,
                    details: {
                        from:
                            fromList.length === 1
                                ? fromList[0]
                                : fromList.join('|'),
                        ...auditDetails,
                    },
                },
            })
        })
        return this.findOne(id)
    }

    private async creditAmountFor(id: string): Promise<Decimal | null> {
        const lines = await this.prisma.sdSalesReturnLine.findMany({
            where: { salesReturnId: id },
            select: { salesOrderLineId: true, quantity: true },
        })
        const orderLines = await this.prisma.sdSalesOrderLine.findMany({
            where: { id: { in: lines.map((l) => l.salesOrderLineId) } },
            select: {
                id: true,
                unitPrice: true,
                lineTotal: true,
                quantity: true,
            },
        })
        return creditAmountForLines(lines, orderLines)
    }

    private async assertCreatePermission(actor: SalesReturnActor) {
        // Cross-module handoff bypasses the SD controller, so the SD permission is enforced here —
        // the same pattern CRM's Closed Won handoff uses for sd.sales-orders.
        await this.permissions.assertPermission(
            { role: actor.role },
            'sd.sales-returns',
            'create',
        )
    }

    private async loadReturnableOrder(
        client: PrismaClientLike,
        salesOrderId: string,
    ) {
        const order = await client.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: { lines: true },
        })
        if (!order) throw new NotFoundException('Sales order not found')
        if (!RETURNABLE_ORDER_STATUSES.has(order.status)) {
            throw new ConflictException(
                `Sales order ${order.orderNumber} is ${order.status}; only CONFIRMED, SHIPPED, DELIVERED or COMPLETED orders can be returned`,
            )
        }
        return order
    }

    private async resolveCompany(
        client: PrismaClientLike,
        order: { companyId: string | null },
        input: string | undefined,
    ) {
        if (input) return input
        if (order.companyId) return order.companyId
        throw new BadRequestException(
            'companyId is required because the sales order is not company-scoped',
        )
    }

    /**
     * Storefront orders carry the shop account id in `customerId`; the return must point at the
     * Customer Master record, either directly or through its linked shop account.
     */
    private async resolveCustomerId(
        client: PrismaClientLike,
        order: { orderNumber: string; customerId: string },
    ) {
        const customer = await client.sdCustomer.findFirst({
            where: {
                OR: [
                    { id: order.customerId },
                    { retailClientId: order.customerId },
                ],
            },
            select: { id: true },
        })
        if (!customer) {
            throw new ConflictException(
                `Sales order ${order.orderNumber} has no Customer Master record; link the shop account to a customer in Customer Master first`,
            )
        }
        return customer.id
    }

    private async lockOrderLine(client: PrismaClientLike, orderLineId: string) {
        const rows = await client.$queryRaw<
            Array<{ id: string; quantity: Decimal }>
        >`
            SELECT "id", "quantity" FROM "sd_sales_order_lines" WHERE "id" = ${orderLineId} FOR UPDATE`
        return rows[0] ?? null
    }

    /** Quantity already claimed by prior returns that are not cancelled/rejected. */
    private async remainingReturnable(
        client: PrismaClientLike,
        salesOrderLineId: string,
    ): Promise<Decimal> {
        const aggregate = await client.sdSalesReturnLine.aggregate({
            where: {
                salesOrderLineId,
                salesReturn: {
                    status: {
                        notIn: [
                            SALES_RETURN_STATUS.CANCELLED,
                            SALES_RETURN_STATUS.REJECTED,
                        ],
                    },
                },
            },
            _sum: { quantity: true },
        })
        const orderLine = await client.sdSalesOrderLine.findUnique({
            where: { id: salesOrderLineId },
            select: { quantity: true },
        })
        if (!orderLine) throw new NotFoundException('Order line not found')
        return orderLine.quantity.minus(aggregate._sum.quantity ?? 0)
    }

    private async nextReturnNumber(client: PrismaClientLike): Promise<string> {
        const count = await client.sdSalesReturn.count()
        return `SR-${String(count + 1).padStart(6, '0')}`
    }
}
