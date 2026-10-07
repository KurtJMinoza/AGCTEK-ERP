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
    CreateMarketplaceCheckoutDto,
    CreateRetailSalesOrderDto,
    CreateRetailSalesOrderLineDto,
    CreateSalesOrderDto,
    CreateSalesOrderFromCrmOpportunityInput,
    ListSalesOrdersQueryDto,
    SD_CATALOG_CURRENCY,
    UpdateRetailSalesOrderStatusDto,
} from './dto/sales-order.dto'
import { RetailClientService } from '../retail/retail-client.service'
import { groupLinesByDivision } from './marketplace-checkout.util'
import { ProductService } from './product.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS } from './sd-event.types'
import { SdMmPipelineService } from './sd-mm-pipeline.service'
import {
    assertCatalogLineInput,
    assertSellable,
    loadBillableCustomer,
    priceCatalogLines,
} from './sd-catalog-pricing'
import { QuotationService } from './quotation.service'

/** Retail order to persist: single-division (header `divisionId`) or a marketplace master (lines tagged). */
type RetailOrderInput = Omit<CreateRetailSalesOrderDto, 'divisionId' | 'lines'> & {
    divisionId: string | null
    lines: ReadonlyArray<CreateRetailSalesOrderLineDto & { divisionId?: string }>
}

/** Storefront divisions whose e-commerce orders require a registered client account. */
const SIGNED_IN_ECOMMERCE_DIVISIONS: ReadonlySet<string> = new Set([
    'DIV_RETAIL',
    'DIV_LPG',
    'DIV_APPLIANCES',
])

export interface CrmSalesOrderHandoffResult {
    salesOrderId: string
    orderNumber: string
    status: string
    customerId: string
    currency: string
    total: string | null
    created: boolean
}

function crmHandoffResult(
    order: {
        id: string
        orderNumber: string
        status: string
        customerId: string
        currency: string
        totalAmount: Decimal | null
    },
    created: boolean,
): CrmSalesOrderHandoffResult {
    return {
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerId: order.customerId,
        currency: order.currency,
        total: order.totalAmount === null ? null : order.totalAmount.toFixed(2),
        created,
    }
}

@Injectable()
export class SalesOrderService {
    constructor(
        private prisma: PrismaService,
        private sdEvents: SdEventEmitterService,
        private retailClients: RetailClientService,
        private products: ProductService,
        private mmPipeline: SdMmPipelineService,
        private quotations: QuotationService,
    ) {}

    private readonly includes = {
        lines: {
            include: { material: true },
            orderBy: { lineNumber: 'asc' as const },
        },
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
                channel: 'STANDARD',
                source: 'ERP',
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

    /**
     * CRM Closed Won handoff: an ECOMMERCE / CRM draft priced from the SD catalog.
     * Idempotent on `crmOpportunityId` (unique): a repeat returns the recorded order
     * with `created: false`. No MM work happens until SD confirms the order.
     *
     * Pass `tx` to create inside the caller's transaction. A unique violation then
     * aborts that transaction; the caller retries it (see
     * `isRetryableCrmHandoffConflict`) and the retry finds the recorded order.
     *
     * With `quotationId` the SENT / ACCEPTED quotation is converted instead: its frozen lines and
     * prices become the order and it is marked CONVERTED in the same transaction (unique
     * `quotationId` on the order; a concurrent conversion returns the first order).
     */
    async createFromCrmOpportunity(
        input: CreateSalesOrderFromCrmOpportunityInput,
        options: { tx?: Prisma.TransactionClient; attempt?: number } = {},
    ): Promise<CrmSalesOrderHandoffResult> {
        if (options.tx) {
            return this.createFromCrmOpportunityIn(
                options.tx,
                input,
                options.attempt ?? 0,
            )
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await this.prisma.$transaction((tx) =>
                    this.createFromCrmOpportunityIn(tx, input, attempt),
                )
            } catch (error) {
                if (this.isRetryableCrmHandoffConflict(error)) continue
                throw error
            }
        }
        throw new ConflictException(
            'Could not allocate a sales order number; retry',
        )
    }

    /**
     * True for sales-order unique violations that a retry of the handoff resolves. Quotations'
     * one-active-per-opportunity index also reports target `crmOpportunityId`, so the model is checked.
     */
    isRetryableCrmHandoffConflict(error: unknown) {
        const target = this.uniqueViolationTarget(error)
        const model = (error as Prisma.PrismaClientKnownRequestError).meta?.modelName
        return (
            !!target &&
            (model === undefined || model === 'SdSalesOrder') &&
            (target.includes('crmOpportunityId') ||
                target.includes('orderNumber'))
        )
    }

    private async createFromCrmOpportunityIn(
        tx: Prisma.TransactionClient,
        input: CreateSalesOrderFromCrmOpportunityInput,
        attempt: number,
    ): Promise<CrmSalesOrderHandoffResult> {
        const existing = await tx.sdSalesOrder.findUnique({
            where: { crmOpportunityId: input.crmOpportunityId },
        })
        if (existing) return crmHandoffResult(existing, false)

        if (input.quotationId && input.lines?.length) {
            throw new BadRequestException(
                'Send either a quotation or lines, not both',
            )
        }
        let customer: Awaited<ReturnType<typeof loadBillableCustomer>>
        let commercial: {
            quotationId: string | null
            divisionId: string | null
            subtotal: Decimal
            totalAmount: Decimal
            lines: {
                lineNumber: number
                productId: string
                sku: string
                description: string
                quantity: Decimal
                unitPrice: Decimal
                lineTotal: Decimal
            }[]
        }
        if (input.quotationId) {
            const claim = await this.quotations.claimForConversion(tx, {
                quotationId: input.quotationId,
                crmOpportunityId: input.crmOpportunityId,
                customerId: input.customerId,
                convertedBy: input.createdBy ?? null,
            })
            if (claim.alreadyConverted) {
                const converted = await tx.sdSalesOrder.findUnique({
                    where: { quotationId: input.quotationId },
                })
                if (!converted) {
                    throw new ConflictException(
                        `Quotation ${claim.quote.quotationNumber} is CONVERTED but has no sales order`,
                    )
                }
                return crmHandoffResult(converted, false)
            }
            customer = await loadBillableCustomer(tx, input.customerId)
            const { quote } = claim
            commercial = {
                quotationId: quote.id,
                divisionId: quote.divisionId,
                subtotal: quote.subtotal,
                totalAmount: quote.totalAmount,
                lines: quote.lines.map((l) => ({
                    lineNumber: l.lineNumber,
                    productId: l.productId,
                    sku: l.sku,
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    lineTotal: l.lineTotal,
                })),
            }
        } else {
            assertCatalogLineInput(input.lines)
            customer = await loadBillableCustomer(tx, input.customerId)
            const pricing = await priceCatalogLines(tx, input.lines!)
            const { divisionId } = assertSellable(pricing)
            commercial = {
                quotationId: null,
                divisionId,
                subtotal: pricing.subtotal,
                totalAmount: pricing.subtotal,
                lines: pricing.lines.map(({ inactive: _inactive, ...line }) => line),
            }
        }
        const { lines } = commercial

        const order = await tx.sdSalesOrder.create({
            data: {
                orderNumber: await this.nextOrderNumber('SO', attempt, tx),
                customerId: customer.id,
                customerName: customer.companyName,
                customerEmail: customer.email,
                channel: 'ECOMMERCE',
                source: 'CRM',
                crmOpportunityId: input.crmOpportunityId,
                quotationId: commercial.quotationId,
                divisionId: commercial.divisionId,
                currency: SD_CATALOG_CURRENCY,
                subtotal: commercial.subtotal,
                totalAmount: commercial.totalAmount,
                status: 'DRAFT',
                correlationId: randomUUID(),
                notes: input.notes ?? null,
                salesOwnerId: input.salesOwnerId ?? null,
                createdBy: input.createdBy ?? null,
                lines: { create: lines },
            },
        })
        return crmHandoffResult(order, true)
    }

    async list(query: ListSalesOrdersQueryDto) {
        const where: Prisma.SdSalesOrderWhereInput = {}
        const and: Prisma.SdSalesOrderWhereInput[] = []
        if (query.channel) where.channel = query.channel
        if (query.source) where.source = query.source
        if (query.customerId) where.customerId = query.customerId
        if (query.divisionId) {
            and.push({
                OR: [
                    { divisionId: query.divisionId },
                    { lines: { some: { divisionId: query.divisionId } } },
                ],
            })
        }
        if (query.branchId) where.branchId = query.branchId

        const search = query.search?.trim()
        if (search) {
            and.push({
                OR: [
                    { orderNumber: { contains: search, mode: 'insensitive' } },
                    { customerName: { contains: search, mode: 'insensitive' } },
                    { customerEmail: { contains: search, mode: 'insensitive' } },
                ],
            })
        }
        if (and.length) where.AND = and

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

        await this.verifyCatalogPrices(dto.divisionId, dto.lines)
        const totals = this.verifyRetailTotals(dto)
        const isPos = dto.channel === 'POS'
        if (isPos && !dto.branchId) {
            throw new BadRequestException(
                'Select a branch before completing a POS sale.',
            )
        }
        const account = await this.requireSignedInClient(
            dto.channel,
            [dto.divisionId],
            dto.customerId,
        )

        for (let attempt = 0; attempt < 3; attempt++) {
            const orderNumber = await this.nextOrderNumber(
                isPos ? 'POS' : 'SO',
                attempt,
            )
            try {
                const created = await this.prisma.sdSalesOrder.create({
                    data: this.retailOrderData(
                        dto,
                        totals,
                        account?.email,
                        orderNumber,
                        randomUUID(),
                    ),
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
        throw new ConflictException(
            'Could not allocate a sales order number; retry',
        )
    }

    /**
     * Marketplace checkout: the whole cart (any mix of divisions) becomes ONE
     * master ECOMMERCE sales order. SD does not split the cart — every line
     * carries its own `divisionId` and MM splits fulfillment downstream. The
     * header `divisionId` stays null. Idempotent on `checkoutId`.
     */
    async createMarketplaceCheckout(dto: CreateMarketplaceCheckoutDto) {
        const master: RetailOrderInput = {
            channel: 'ECOMMERCE',
            idempotencyKey: dto.checkoutId,
            divisionId: null,
            customerId: dto.customerId,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            lines: dto.cartItems,
            subtotal: dto.subtotal,
            discountAmount: dto.discountAmount,
            promoCode: dto.promoCode,
            shippingAmount: dto.shippingAmount,
            totalAmount: dto.totalAmount,
            shippingAddress: dto.shippingAddress,
            createdBy: dto.createdBy,
        }

        const existing = await this.findCheckoutOrder(dto.checkoutId)
        if (existing) return this.checkoutResult(dto, existing)

        for (const [divisionId, items] of groupLinesByDivision(
            dto.cartItems.map((line, idx) => ({ ...line, lineNumber: idx + 1 })),
        )) {
            await this.verifyCatalogPrices(divisionId, items)
        }
        const totals = this.verifyRetailTotals(master)
        const account = await this.requireSignedInClient(
            master.channel,
            dto.cartItems.map((line) => line.divisionId),
            dto.customerId,
        )

        for (let attempt = 0; attempt < 3; attempt++) {
            const orderNumber = await this.nextOrderNumber('SO', attempt)
            try {
                const order = await this.prisma.sdSalesOrder.create({
                    data: this.retailOrderData(
                        master,
                        totals,
                        account?.email,
                        orderNumber,
                        dto.checkoutId,
                    ),
                    include: { lines: { orderBy: { lineNumber: 'asc' } } },
                })
                return this.checkoutResult(dto, order)
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('idempotencyKey')) {
                    const recorded = await this.findCheckoutOrder(dto.checkoutId)
                    if (recorded) return this.checkoutResult(dto, recorded)
                }
                if (target?.includes('orderNumber')) continue
                throw error
            }
        }
        throw new ConflictException(
            'Could not allocate a sales order number; retry',
        )
    }

    private findCheckoutOrder(checkoutId: string) {
        return this.prisma.sdSalesOrder.findUnique({
            where: { idempotencyKey: checkoutId },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
    }

    /** A replayed `checkoutId` must describe the cart that was recorded. */
    private checkoutResult(
        dto: CreateMarketplaceCheckoutDto,
        order: NonNullable<
            Awaited<ReturnType<SalesOrderService['findCheckoutOrder']>>
        >,
    ) {
        const sameCart =
            order.channel === 'ECOMMERCE' &&
            order.lines.length === dto.cartItems.length &&
            dto.cartItems.every((item, idx) => {
                const line = order.lines[idx]
                return (
                    line.sku === item.sku &&
                    line.divisionId === item.divisionId &&
                    line.quantity.eq(item.quantity)
                )
            })
        if (!sameCart) {
            throw new ConflictException(
                'This checkout was already placed with a different cart',
            )
        }
        return {
            checkoutId: dto.checkoutId,
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            order,
        }
    }

    private retailOrderData(
        dto: RetailOrderInput,
        totals: ReturnType<SalesOrderService['verifyRetailTotals']>,
        accountEmail: string | undefined,
        orderNumber: string,
        correlationId: string,
    ): Prisma.SdSalesOrderCreateInput {
        const isPos = dto.channel === 'POS'
        const shipTo = isPos ? undefined : dto.shippingAddress
        return {
            orderNumber,
            channel: dto.channel,
            source: isPos ? 'POS' : 'WEBSITE',
            divisionId: dto.divisionId,
            branchId: dto.branchId ?? null,
            customerId: dto.customerId,
            customerName: dto.customerName,
            customerEmail: accountEmail ?? dto.customerEmail ?? null,
            shipToName: shipTo?.fullName ?? null,
            shipToPhone: shipTo?.phone ?? null,
            shipToAddressLine1: shipTo?.addressLine1 ?? null,
            shipToCity: shipTo?.city ?? null,
            shipToRegion: shipTo?.region ?? null,
            shipToPostalCode: shipTo?.postalCode ?? null,
            shipToCountry: shipTo?.country ?? null,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            promoCode: dto.promoCode ?? null,
            shippingAmount: totals.shippingAmount,
            totalAmount: totals.totalAmount,
            paymentReceived: totals.paymentReceived,
            changeAmount: totals.changeAmount,
            status: isPos ? 'COMPLETED' : 'CONFIRMED',
            correlationId,
            idempotencyKey: dto.idempotencyKey,
            createdBy: dto.createdBy ?? null,
            lines: {
                create: dto.lines.map((line, idx) => ({
                    lineNumber: idx + 1,
                    divisionId: line.divisionId ?? dto.divisionId,
                    sku: line.sku,
                    description: line.description,
                    quantity: new Decimal(line.quantity),
                    unitPrice: new Decimal(line.unitPrice),
                    lineTotal: new Decimal(line.lineTotal),
                    integrationStatus: isPos ? 'FULFILLED' : 'OPEN',
                })),
            },
        }
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

        const lineStatus =
            dto.status === 'COMPLETED' ? 'FULFILLED' : 'CANCELLED'
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

    private dateRangeStart(
        range: ListSalesOrdersQueryDto['dateRange'],
    ): Date | null {
        if (!range || range === 'all') return null
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        if (range === 'last7days') start.setDate(start.getDate() - 6)
        if (range === 'last30days') start.setDate(start.getDate() - 29)
        return start
    }

    /** Each line must be an active SdProduct of `divisionId`, at its current price. */
    private async verifyCatalogPrices(
        divisionId: string,
        lines: ReadonlyArray<CreateRetailSalesOrderLineDto & { lineNumber?: number }>,
    ) {
        const prices = await this.products.activePriceMap(
            divisionId,
            lines.map((line) => line.sku),
        )
        lines.forEach((line, idx) => {
            const lineNumber = line.lineNumber ?? idx + 1
            const price = prices.get(line.sku)
            if (!price) {
                throw new BadRequestException(
                    `Line ${lineNumber}: ${line.sku} is not an active ${divisionId} product`,
                )
            }
            if (!new Decimal(line.unitPrice).toDecimalPlaces(2).eq(price)) {
                throw new BadRequestException(
                    `Line ${lineNumber}: price for ${line.sku} changed to ${price.toFixed(2)}, refresh and try again`,
                )
            }
        })
    }

    private verifyRetailTotals(
        dto: Pick<
            RetailOrderInput,
            | 'channel'
            | 'lines'
            | 'subtotal'
            | 'discountAmount'
            | 'shippingAmount'
            | 'totalAmount'
            | 'paymentReceived'
        >,
    ) {
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
            const expected = money(
                new Decimal(line.unitPrice).times(line.quantity),
            )
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
                throw new BadRequestException(
                    'POS orders cannot carry shipping',
                )
            }
            if (dto.paymentReceived === undefined) {
                throw new BadRequestException(
                    'POS orders require paymentReceived',
                )
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
            throw new BadRequestException(
                'E-commerce orders do not accept paymentReceived',
            )
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

    private async requireSignedInClient(
        channel: RetailOrderInput['channel'],
        divisionIds: readonly string[],
        customerId: string,
    ) {
        if (
            channel !== 'ECOMMERCE' ||
            !divisionIds.some((id) => SIGNED_IN_ECOMMERCE_DIVISIONS.has(id))
        ) {
            return null
        }
        try {
            return await this.retailClients.getProfile(customerId)
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
            throw new BadRequestException(
                'Cannot confirm a cancelled sales order',
            )
        }
        if (order.status === 'CONFIRMED') {
            return order
        }
        if (order.status !== 'DRAFT') {
            throw new BadRequestException(
                `Cannot confirm order in status ${order.status}`,
            )
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
            throw new BadRequestException(
                'Cannot change quantity on cancelled order',
            )
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
            const status = order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN'
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

    /**
     * `attempt > 0` adds a random suffix after an orderNumber collision. Pass the
     * transaction client so orders created earlier in it are counted.
     */
    private async nextOrderNumber(
        prefix = 'SO',
        attempt = 0,
        client: Prisma.TransactionClient = this.prisma,
    ) {
        const count = await client.sdSalesOrder.count({
            where: { orderNumber: { startsWith: `${prefix}-` } },
        })
        const number = `${prefix}-${String(count + 1).padStart(6, '0')}`
        return attempt === 0
            ? number
            : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
    }
}
