import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
    ChangeSalesOrderLineQtyDto,
    CreateRetailSalesOrderDto,
    CreateSalesOrderDto,
    ListSalesOrdersQueryDto,
    UpdateRetailSalesOrderStatusDto,
} from './dto/sales-order.dto'
import { RetailClientService } from '../retail/retail-client.service'
import { ProductService } from './product.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS } from './sd-event.types'
import { SdMmPipelineService } from './sd-mm-pipeline.service'

/** Storefront divisions whose e-commerce orders require a registered client account. */
const SIGNED_IN_ECOMMERCE_DIVISIONS: ReadonlySet<string> = new Set([
    'DIV_RETAIL',
    'DIV_LPG',
    'DIV_APPLIANCES',
])

@Injectable()
export class SalesOrderService {
    constructor(
        private prisma: PrismaService,
        private sdEvents: SdEventEmitterService,
        private retailClients: RetailClientService,
        private products: ProductService,
        private mmPipeline: SdMmPipelineService,
    ) {}

    private readonly includes = {
        lines: { include: { material: true }, orderBy: { lineNumber: 'asc' as const } },
        warehouse: true,
        company: true,
    }

    async create(dto: CreateSalesOrderDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one line is required')
        }
        const orderNumber = await this.nextOrderNumber()
        const correlationId = randomUUID()
        return this.prisma.sdSalesOrder.create({
            data: {
                orderNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                customerId: dto.customerId,
                correlationId,
                idempotencyKey: dto.idempotencyKey ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: {
                    create: dto.lines.map((line, idx) => ({
                        lineNumber: idx + 1,
                        materialId: line.materialId,
                        quantity: new Decimal(line.quantity),
                    })),
                },
            },
            include: this.includes,
        })
    }

    async list(query: ListSalesOrdersQueryDto) {
        const where: Prisma.SdSalesOrderWhereInput = {}
        if (query.channel) where.channel = query.channel
        if (query.customerId) where.customerId = query.customerId
        if (query.divisionId) where.divisionId = query.divisionId
        if (query.branchId) where.branchId = query.branchId

        const search = query.search?.trim()
        if (search) {
            where.OR = [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerEmail: { contains: search, mode: 'insensitive' } },
            ]
        }

        const from = this.dateRangeStart(query.dateRange)
        if (from) where.createdAt = { gte: from }

        return this.prisma.sdSalesOrder.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: query.limit ?? 200,
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
            },
        })
    }

    /**
     * Persists a priced retail order (POS fast-track or e-commerce standard).
     * Idempotent on `idempotencyKey`. Totals are re-verified server-side; no MM
     * events are emitted until retail SKUs are mapped to MM-01 materials.
     */
    async createRetail(dto: CreateRetailSalesOrderDto) {
        const existing = await this.prisma.sdSalesOrder.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
        if (existing) return existing

        await this.verifyCatalogPrices(dto)
        const totals = this.verifyRetailTotals(dto)
        const isPos = dto.channel === 'POS'
        if (isPos && !dto.branchId) {
            throw new BadRequestException('Select a branch before completing a POS sale.')
        }
        const account = await this.requireSignedInClient(dto)

        for (let attempt = 0; attempt < 3; attempt++) {
            const orderNumber = await this.nextOrderNumber(
                isPos ? 'POS' : 'SO',
                attempt,
            )
            try {
                const created = await this.prisma.sdSalesOrder.create({
                    data: {
                        orderNumber,
                        channel: dto.channel,
                        divisionId: dto.divisionId,
                        branchId: dto.branchId ?? null,
                        customerId: dto.customerId,
                        customerName: dto.customerName,
                        customerEmail: account?.email ?? dto.customerEmail ?? null,
                        subtotal: totals.subtotal,
                        discountAmount: totals.discountAmount,
                        promoCode: dto.promoCode ?? null,
                        shippingAmount: totals.shippingAmount,
                        totalAmount: totals.totalAmount,
                        paymentReceived: totals.paymentReceived,
                        changeAmount: totals.changeAmount,
                        status: 'CONFIRMED',
                        correlationId: randomUUID(),
                        idempotencyKey: dto.idempotencyKey,
                        createdBy: dto.createdBy ?? null,
                        lines: {
                            create: dto.lines.map((line, idx) => ({
                                lineNumber: idx + 1,
                                sku: line.sku,
                                description: line.description,
                                quantity: new Decimal(line.quantity),
                                unitPrice: new Decimal(line.unitPrice),
                                lineTotal: new Decimal(line.lineTotal),
                                integrationStatus: 'OPEN',
                            })),
                        },
                    },
                    include: { lines: { orderBy: { lineNumber: 'asc' } } },
                })
                const { integrated } = await this.mmPipeline.integrateConfirmedOrder(
                    created.id,
                )
                if (isPos && integrated) {
                    return this.prisma.sdSalesOrder.update({
                        where: { id: created.id },
                        data: { status: 'COMPLETED' },
                        include: { lines: { orderBy: { lineNumber: 'asc' } } },
                    })
                }
                return created
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('idempotencyKey')) {
                    const existing =
                        await this.prisma.sdSalesOrder.findUniqueOrThrow({
                            where: { idempotencyKey: dto.idempotencyKey },
                            include: { lines: { orderBy: { lineNumber: 'asc' } } },
                        })
                    return existing
                }
                if (target?.includes('orderNumber')) continue
                throw error
            }
        }
        throw new ConflictException('Could not allocate a sales order number; retry')
    }

    /**
     * Retail back-office transitions. Only e-commerce orders awaiting delivery
     * (CONFIRMED) may move; POS sales are completed at the counter and need a
     * return flow, not a status change. Re-applying the current status is a no-op.
     */
    async updateRetailStatus(id: string, dto: UpdateRetailSalesOrderStatusDto) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
        if (!order) throw new NotFoundException('Sales order not found')
        if (order.channel !== 'POS' && order.channel !== 'ECOMMERCE') {
            throw new BadRequestException(
                'Only POS / e-commerce orders can be updated through this endpoint',
            )
        }
        if (order.status === dto.status) return order

        const allowed: Record<string, readonly string[]> = {
            CONFIRMED: ['COMPLETED', 'CANCELLED'],
        }
        if (!allowed[order.status]?.includes(dto.status)) {
            throw new ConflictException(
                `Cannot change ${order.orderNumber} from ${order.status} to ${dto.status}`,
            )
        }

        const lineStatus = dto.status === 'COMPLETED' ? 'FULFILLED' : 'CANCELLED'
        try {
            const [, updated] = await this.prisma.$transaction([
                this.prisma.sdSalesOrderLine.updateMany({
                    where: { salesOrderId: id },
                    data: { integrationStatus: lineStatus },
                }),
                this.prisma.sdSalesOrder.update({
                    where: { id, status: order.status },
                    data: { status: dto.status },
                    include: { lines: { orderBy: { lineNumber: 'asc' } } },
                }),
            ])
            return updated
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                throw new ConflictException(
                    `${order.orderNumber} was changed by someone else; refresh and retry`,
                )
            }
            throw error
        }
    }

    private dateRangeStart(range: ListSalesOrdersQueryDto['dateRange']): Date | null {
        if (!range || range === 'all') return null
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        if (range === 'last7days') start.setDate(start.getDate() - 6)
        if (range === 'last30days') start.setDate(start.getDate() - 29)
        return start
    }

    /** Each line must be an active SdProduct of the order's division, at its current price. */
    private async verifyCatalogPrices(dto: CreateRetailSalesOrderDto) {
        const prices = await this.products.activePriceMap(
            dto.divisionId,
            dto.lines.map((line) => line.sku),
        )
        dto.lines.forEach((line, idx) => {
            const price = prices.get(line.sku)
            if (!price) {
                throw new BadRequestException(
                    `Line ${idx + 1}: ${line.sku} is not an active ${dto.divisionId} product`,
                )
            }
            if (!new Decimal(line.unitPrice).toDecimalPlaces(2).eq(price)) {
                throw new BadRequestException(
                    `Line ${idx + 1}: price for ${line.sku} changed to ${price.toFixed(2)}, refresh and try again`,
                )
            }
        })
    }

    private verifyRetailTotals(dto: CreateRetailSalesOrderDto) {
        const money = (value: number | Decimal) =>
            new Decimal(value).toDecimalPlaces(2)
        const mismatch = (label: string, expected: Decimal, got: number) => {
            if (!money(got).eq(expected)) {
                throw new BadRequestException(
                    `${label} mismatch: expected ${expected.toFixed(2)}, received ${money(got).toFixed(2)}`,
                )
            }
        }

        let subtotal = new Decimal(0)
        dto.lines.forEach((line, idx) => {
            const expected = money(new Decimal(line.unitPrice).times(line.quantity))
            mismatch(`Line ${idx + 1} total`, expected, line.lineTotal)
            subtotal = subtotal.plus(expected)
        })
        mismatch('Subtotal', subtotal, dto.subtotal)

        const discountAmount = money(dto.discountAmount)
        if (discountAmount.gt(subtotal)) {
            throw new BadRequestException('Discount cannot exceed subtotal')
        }
        const shippingAmount = money(dto.shippingAmount)
        const totalAmount = subtotal.minus(discountAmount).plus(shippingAmount)
        mismatch('Total', totalAmount, dto.totalAmount)

        if (dto.channel === 'POS') {
            if (!shippingAmount.isZero()) {
                throw new BadRequestException('POS orders cannot carry shipping')
            }
            if (dto.paymentReceived === undefined) {
                throw new BadRequestException('POS orders require paymentReceived')
            }
            const paymentReceived = money(dto.paymentReceived)
            if (paymentReceived.lt(totalAmount)) {
                throw new BadRequestException(
                    `Insufficient payment: received ${paymentReceived.toFixed(2)}, due ${totalAmount.toFixed(2)}`,
                )
            }
            return {
                subtotal,
                discountAmount,
                shippingAmount,
                totalAmount,
                paymentReceived,
                changeAmount: paymentReceived.minus(totalAmount),
            }
        }

        if (dto.paymentReceived !== undefined) {
            throw new BadRequestException('E-commerce orders do not accept paymentReceived')
        }
        return {
            subtotal,
            discountAmount,
            shippingAmount,
            totalAmount,
            paymentReceived: null,
            changeAmount: null,
        }
    }

    private async requireSignedInClient(dto: CreateRetailSalesOrderDto) {
        if (
            dto.channel !== 'ECOMMERCE' ||
            !SIGNED_IN_ECOMMERCE_DIVISIONS.has(dto.divisionId)
        ) {
            return null
        }
        try {
            return await this.retailClients.getProfile(dto.customerId)
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new BadRequestException(
                    'Please sign in to your account before placing an order.',
                )
            }
            throw error
        }
    }

    private uniqueViolationTarget(error: unknown): string[] | null {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            const target = error.meta?.target
            return Array.isArray(target) ? target.map(String) : [String(target)]
        }
        return null
    }

    async findOne(id: string) {
        const row = await this.prisma.sdSalesOrder.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!row) throw new NotFoundException('Sales order not found')
        return row
    }

    async confirm(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot confirm a cancelled sales order')
        }
        if (order.status === 'CONFIRMED') {
            return order
        }
        if (order.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot confirm order in status ${order.status}`)
        }

        await this.mmPipeline.enrichOrderForMmIntegration(id)
        const enriched = await this.findOne(id)
        if (!this.mmPipeline.isMmLinked(enriched)) {
            throw new BadRequestException(
                'Sales order must reference a company, warehouse and MM materials before confirmation',
            )
        }

        const updated = await this.prisma.sdSalesOrder.update({
            where: { id },
            data: { status: 'CONFIRMED' },
            include: this.includes,
        })

        await this.mmPipeline.emitSalesOrderConfirmedIntegration(updated)
        return updated
    }

    async cancel(id: string) {
        const order = await this.findOne(id)
        if (order.status === 'CANCELLED') return order

        const updated = await this.prisma.sdSalesOrder.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })

        if (this.mmPipeline.isMmLinked(updated)) {
            await this.sdEvents.emit(
                SD_EVENTS.SALES_ORDER_CANCELLED,
                this.mmPipeline.toEventPayload(updated),
            )
        }
        return updated
    }

    async changeQuantity(
        orderId: string,
        lineId: string,
        dto: ChangeSalesOrderLineQtyDto,
    ) {
        const order = await this.findOne(orderId)
        if (order.status === 'CANCELLED') {
            throw new BadRequestException('Cannot change quantity on cancelled order')
        }
        const line = order.lines.find((l) => l.id === lineId)
        if (!line) throw new NotFoundException('Sales order line not found')

        const newQty = new Decimal(dto.quantity)
        if (newQty.lt(line.issuedQuantity)) {
            throw new BadRequestException(
                'New quantity cannot be less than already issued quantity',
            )
        }

        const previousQuantity = line.quantity.toString()
        await this.prisma.sdSalesOrderLine.update({
            where: { id: lineId },
            data: { quantity: newQty },
        })

        const refreshed = await this.findOne(orderId)
        if (!this.mmPipeline.isMmLinked(refreshed)) return refreshed
        await this.sdEvents.emit(SD_EVENTS.SALES_DEMAND_CHANGED, {
            ...this.mmPipeline.toEventPayload(refreshed),
            changedLines: [
                {
                    lineId,
                    demandReferenceLineId: lineId,
                    previousQuantity,
                    newQuantity: newQty.toString(),
                },
            ],
        })
        return refreshed
    }

    async applyReservationCreated(args: {
        salesOrderId: string
        reservationHeaderId: string
        lines: Array<{
            lineId: string
            reservedQuantity: string
            integrationStatus: string
        }>
    }) {
        for (const line of args.lines) {
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.lineId },
                data: {
                    reservationHeaderId: args.reservationHeaderId,
                    reservedQuantity: new Decimal(line.reservedQuantity),
                    integrationStatus: line.integrationStatus,
                },
            })
        }
    }

    async applyReservationReleased(salesOrderId: string, reason?: string) {
        const order = await this.findOne(salesOrderId)
        for (const line of order.lines) {
            const status =
                order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN'
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.id },
                data: {
                    reservedQuantity: new Decimal(0),
                    reservationHeaderId: null,
                    integrationStatus: status,
                },
            })
        }
        return { salesOrderId, reason: reason ?? 'RELEASED' }
    }

    async applyPartialRelease(args: {
        salesOrderId: string
        lineId: string
        newReservedQuantity: string
    }) {
        await this.prisma.sdSalesOrderLine.update({
            where: { id: args.lineId },
            data: {
                reservedQuantity: new Decimal(args.newReservedQuantity),
                integrationStatus: 'RESERVED',
            },
        })
    }

    async applyGoodsIssuePosted(args: {
        salesOrderId: string
        lines: Array<{ lineId: string; issuedQuantity: string }>
    }) {
        for (const line of args.lines) {
            const existing = await this.prisma.sdSalesOrderLine.findUnique({
                where: { id: line.lineId },
            })
            if (!existing) continue
            const issued = new Decimal(existing.issuedQuantity).plus(
                line.issuedQuantity,
            )
            const fulfilled = issued.gte(existing.quantity)
            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.lineId },
                data: {
                    issuedQuantity: issued,
                    integrationStatus: fulfilled ? 'FULFILLED' : 'RESERVED',
                },
            })
        }
    }

    /** `attempt > 0` adds a random suffix after an orderNumber collision. */
    private async nextOrderNumber(prefix = 'SO', attempt = 0) {
        const count = await this.prisma.sdSalesOrder.count({
            where: { orderNumber: { startsWith: `${prefix}-` } },
        })
        const number = `${prefix}-${String(count + 1).padStart(6, '0')}`
        return attempt === 0
            ? number
            : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
    }
}
