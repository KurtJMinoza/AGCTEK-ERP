import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
    ChangeSalesOrderLineQtyDto,
    CheckoutPaymentMethod,
    CreateMarketplaceCheckoutDto,
    CreateRetailSalesOrderDto,
    CreateRetailSalesOrderLineDto,
    CreateSalesOrderDto,
    CreateSalesOrderFromCrmOpportunityInput,
    CustomerCancelOrderDto,
    DemoPaymentStatus,
    ListSalesOrdersQueryDto,
    SD_CATALOG_CURRENCY,
    UpdateOrderPaymentStatusDto,
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
    paymentMethod?: CheckoutPaymentMethod
    paymentProvider?: string
    cardDemoSimulateFailure?: boolean
}

/** One demo-mode checkout payment outcome (no real gateways connected). */
type DemoPaymentPlan = {
    method: CheckoutPaymentMethod
    provider: string | null
    status: DemoPaymentStatus
    /** True when the order may proceed to reservation + picking now. */
    canFulfill: boolean
    reference: string
    paidAt: Date | null
}

/** Payment record statuses that allow warehouse fulfillment (reservation + picking). */
const FULFILLMENT_READY_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
    'Paid',
    'Authorized',
    'Pending Collection', // Cash on Delivery — collected at the door.
])

export function paymentAllowsFulfillment(status: string): boolean {
    return FULFILLMENT_READY_PAYMENT_STATUSES.has(status)
}

/** Storefront divisions whose e-commerce orders require a registered client account. */
const SIGNED_IN_ECOMMERCE_DIVISIONS: ReadonlySet<string> = new Set([
    'DIV_RETAIL',
    'DIV_LPG',
    'DIV_APPLIANCES',
])

/** Server-authoritative flat delivery fee per selling division (PHP).
 *  The backend re-verifies checkout shipping against this rate — the
 *  storefront never decides its own freight. Override with env. */
const ECOMMERCE_FREIGHT_PHP = Number(process.env.ECOMMERCE_FREIGHT_PHP ?? 50)

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
        // `all` (the dashboard's default select value) means no company filter.
        if (query.companyId && query.companyId !== 'all') {
            where.companyId = query.companyId
        }
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

        const rows = await this.prisma.sdSalesOrder.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: query.limit ?? 200,
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                company: true,
            },
        })
        const cancellation = await this.customerCancellationMap(rows)
        return rows.map((row) => ({
            ...row,
            customerCancel: cancellation.get(row.id) ?? {
                canCancel: false,
                reason: null,
            },
        }))
    }

    /**
     * Persists a priced retail order (POS fast-track or e-commerce standard).
     * Idempotent on `idempotencyKey`. Totals are re-verified server-side; no MM
     * events are emitted until retail SKUs are mapped to MM-01 materials.
     */
    async createRetail(
        dto: CreateRetailSalesOrderDto,
        sessionClientId: string | null = null,
    ) {
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
            sessionClientId,
        )
        const snapshots = await this.retailLineSnapshots(
            dto.lines,
            dto.divisionId,
        )
        let checkoutCompanyId: string | null = null
        try {
            checkoutCompanyId = await this.mmPipeline.resolveCheckoutCompanyId()
        } catch {
            checkoutCompanyId = null
        }
        if (!checkoutCompanyId) {
            throw new BadRequestException(
                'No company is configured for this store. Please contact your administrator before completing the sale.',
            )
        }

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
                        undefined,
                        snapshots,
                        checkoutCompanyId,
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
    async createMarketplaceCheckout(
        dto: CreateMarketplaceCheckoutDto,
        sessionClientId: string | null = null,
    ) {
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
            paymentMethod: dto.paymentMethod,
            paymentProvider: dto.paymentProvider,
            cardDemoSimulateFailure: dto.cardDemoSimulateFailure,
        }
        const payment = this.demoPaymentPlan(dto)

        const existing = await this.findCheckoutOrder(dto.checkoutId)
        if (existing) {
            // Replayed checkout: heal a payment record that a crash may have
            // missed without touching the already-recorded order.
            await this.recordPaymentForOrder(existing, payment, dto.createdBy)
            return this.checkoutResult(dto, existing)
        }

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
            sessionClientId,
        )
        const snapshots = await this.retailLineSnapshots(dto.cartItems, null)

        // Sales Order company comes from the Organization setup (validated to
        // exist) — never from the client. Block checkout with a clear error
        // when no company is configured instead of recording an order without
        // one (no division/branch/fallback guessing).
        let checkoutCompanyId: string | null = null
        try {
            checkoutCompanyId =
                await this.mmPipeline.resolveCheckoutCompanyId()
        } catch {
            checkoutCompanyId = null
        }
        if (!checkoutCompanyId) {
            throw new BadRequestException(
                'No company is configured for this store. Please contact your administrator before placing an order.',
            )
        }

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
                        payment,
                        snapshots,
                        checkoutCompanyId,
                    ),
                    include: { lines: { orderBy: { lineNumber: 'asc' } } },
                })
                // Material resolution + company/warehouse scope always run;
                // reservation and auto picking only fire when the payment
                // method is cleared for fulfillment (see demoPaymentPlan).
                const enriched =
                    await this.mmPipeline.enrichOrderForMmIntegration(order.id)
                if (
                    payment.canFulfill &&
                    enriched &&
                    this.mmPipeline.isMmLinked(enriched)
                ) {
                    await this.mmPipeline.emitSalesOrderConfirmedIntegration(
                        enriched,
                    )
                }
                await this.recordPaymentForOrder(
                    enriched ?? order,
                    payment,
                    dto.createdBy,
                )
                return this.checkoutResult(dto, order)
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('idempotencyKey')) {
                    const recorded = await this.findCheckoutOrder(dto.checkoutId)
                    if (recorded) {
                        await this.recordPaymentForOrder(
                            recorded,
                            payment,
                            dto.createdBy,
                        )
                        return this.checkoutResult(dto, recorded)
                    }
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
     * Demo-mode payment outcome for a checkout. No real gateway is connected:
     * COD is recorded pending collection, demo cards may simulate failure,
     * wallets/QR confirm as paid, bank transfers wait for admin verification.
     */
    private demoPaymentPlan(dto: CreateMarketplaceCheckoutDto): DemoPaymentPlan {
        const reference = `DEMO-${dto.checkoutId
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(-10)
            .toUpperCase()}`
        const paidAt = new Date()
        switch (dto.paymentMethod) {
            case 'COD':
                return {
                    method: dto.paymentMethod,
                    provider: dto.paymentProvider ?? null,
                    status: 'Pending Collection',
                    canFulfill: true,
                    reference,
                    paidAt: null,
                }
            case 'BANK_TRANSFER_DEMO':
                return {
                    method: dto.paymentMethod,
                    provider: dto.paymentProvider ?? null,
                    status: 'Pending Verification',
                    canFulfill: false,
                    reference,
                    paidAt: null,
                }
            case 'CARD_DEMO':
                return dto.cardDemoSimulateFailure
                    ? {
                          method: dto.paymentMethod,
                          provider: dto.paymentProvider ?? null,
                          status: 'Failed',
                          canFulfill: false,
                          reference,
                          paidAt: null,
                      }
                    : {
                          method: dto.paymentMethod,
                          provider: dto.paymentProvider ?? null,
                          status: 'Paid',
                          canFulfill: true,
                          reference,
                          paidAt,
                      }
            case 'WALLET_DEMO':
            case 'QR_DEMO':
                return {
                    method: dto.paymentMethod,
                    provider: dto.paymentProvider ?? null,
                    status: 'Paid',
                    canFulfill: true,
                    reference,
                    paidAt,
                }
        }
    }

    /**
     * One payment record per order, always company-scoped. Uses the enriched
     * order's company so `companyId` is never null (checks skipped otherwise).
     */
    private async recordPaymentForOrder(
        order: {
            id: string
            companyId: string | null
            customerId: string
            totalAmount: Decimal | null
        },
        payment: DemoPaymentPlan,
        createdBy?: string,
    ) {
        if (!order.companyId) return null
        const existing = await this.prisma.sdSalesOrderPayment.findFirst({
            where: { salesOrderId: order.id },
        })
        if (existing) return existing
        return this.prisma.sdSalesOrderPayment.create({
            data: {
                companyId: order.companyId,
                salesOrderId: order.id,
                customerId: order.customerId,
                paymentMethod: payment.method,
                paymentProvider: payment.provider,
                amount: order.totalAmount ?? new Decimal(0),
                currency: SD_CATALOG_CURRENCY,
                status: payment.status,
                referenceNumber: payment.reference,
                isDemo: true,
                paidAt: payment.paidAt,
                createdBy: createdBy ?? null,
            },
        })
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

    /**
     * Latest catalog product / variant data per retail line. Snapshots are
     * stored on the order line so order history keeps the correct name and
     * photo even when the catalog product or its image changes later.
     */
    private async retailLineSnapshots(
        lines: ReadonlyArray<
            CreateRetailSalesOrderLineDto & { divisionId?: string }
        >,
        headerDivisionId: string | null,
    ) {
        const skuKeys = new Set<string>()
        const variantIds = new Set<string>()
        for (const line of lines) {
            const divisionId = line.divisionId ?? headerDivisionId
            if (line.sku && divisionId) skuKeys.add(`${divisionId}:${line.sku}`)
            if (line.variantId) variantIds.add(line.variantId)
        }
        const [products, variants] = await Promise.all([
            skuKeys.size
                ? this.prisma.sdProduct.findMany({
                      where: {
                          OR: [...skuKeys].map((key) => {
                              const [divisionId, sku] = key.split(':')
                              return { divisionId, sku }
                          }),
                      },
                      select: {
                          divisionId: true,
                          sku: true,
                          name: true,
                          imageUrl: true,
                      },
                  })
                : Promise.resolve([]),
            variantIds.size
                ? this.prisma.sdProductVariant.findMany({
                      where: { id: { in: [...variantIds] } },
                      select: {
                          id: true,
                          variantName: true,
                          sku: true,
                          barcode: true,
                          imageUrl: true,
                      },
                  })
                : Promise.resolve([]),
        ])
        return {
            productByKey: new Map(
                products.map((product) => [
                    `${product.divisionId}:${product.sku}`,
                    product,
                ]),
            ),
            variantById: new Map(variants.map((variant) => [variant.id, variant])),
        }
    }

    private retailOrderData(
        dto: RetailOrderInput,
        totals: ReturnType<SalesOrderService['verifyRetailTotals']>,
        accountEmail: string | undefined,
        orderNumber: string,
        correlationId: string,
        payment?: DemoPaymentPlan,
        snapshots?: Awaited<
            ReturnType<SalesOrderService['retailLineSnapshots']>
        >,
        companyId?: string | null,
    ): Prisma.SdSalesOrderCreateInput | Prisma.SdSalesOrderUncheckedCreateInput {
        const isPos = dto.channel === 'POS'
        const shipTo = isPos ? undefined : dto.shippingAddress
        return {
            orderNumber,
            channel: dto.channel,
            source: isPos ? 'POS' : 'WEBSITE',
            companyId: companyId ?? null,
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
            paymentMethod: payment?.method ?? null,
            paymentStatus: payment?.status ?? null,
            paymentReference: payment?.reference ?? null,
            paymentProvider: payment?.provider ?? null,
            isDemoPayment: payment ? true : false,
            status: isPos ? 'COMPLETED' : 'CONFIRMED',
            correlationId,
            idempotencyKey: dto.idempotencyKey,
            createdBy: dto.createdBy ?? null,
            lines: {
                create: dto.lines.map((line, idx) => {
                    const divisionId = line.divisionId ?? dto.divisionId
                    const key =
                        line.sku && divisionId ? `${divisionId}:${line.sku}` : null
                    const product = key
                        ? snapshots?.productByKey.get(key)
                        : undefined
                    const variant = line.variantId
                        ? snapshots?.variantById.get(line.variantId)
                        : undefined
                    return {
                        lineNumber: idx + 1,
                        divisionId,
                        companyId: companyId ?? null,
                        sku: line.sku,
                        description: line.description,
                        productNameSnapshot:
                            product?.name ??
                            line.description ??
                            undefined,
                        productImageSnapshot: product?.imageUrl?.trim()
                            ? product.imageUrl
                            : undefined,
                        variantId: line.variantId ?? null,
                        variantName:
                            variant?.variantName ?? line.variantName ?? null,
                        variantSku: variant?.sku ?? null,
                        variantBarcode: variant?.barcode ?? null,
                        quantity: new Decimal(line.quantity),
                        unitPrice: new Decimal(line.unitPrice),
                        lineTotal: new Decimal(line.lineTotal),
                        integrationStatus: isPos ? 'FULFILLED' : 'OPEN',
                    }
                }),
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

    /**
     * Admin action on an e-commerce order's demo payment record: mark a bank
     * transfer Verified / a COD Collected / any order Paid. When the payment
     * becomes allowed for fulfillment, reservation + auto picking are
     * triggered if they have not been created yet.
     */
    async updateOrderPaymentStatus(
        id: string,
        dto: UpdateOrderPaymentStatusDto,
    ) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        })
        if (!order) throw new NotFoundException('Sales order not found')
        const payment = order.payments[0]
        if (!payment) {
            throw new BadRequestException(
                'This order has no payment record to update',
            )
        }
        if (payment.status === dto.status) return this.findOne(id)

        const target = dto.status
        const settled = payment.status === 'Paid' || payment.status === 'Refunded'
        if (target === 'Refunded' && payment.status !== 'Paid') {
            throw new ConflictException(
                `Only a Paid payment can be refunded (current: ${payment.status})`,
            )
        }
        if ((target === 'Failed' || target === 'Cancelled') && settled) {
            throw new ConflictException(
                `Cannot mark a ${payment.status} payment as ${target}`,
            )
        }

        const paidAt =
            target === 'Paid' ? payment.paidAt ?? new Date() : payment.paidAt
        await this.prisma.$transaction([
            this.prisma.sdSalesOrderPayment.update({
                where: { id: payment.id },
                data: { status: target, paidAt },
            }),
            this.prisma.sdSalesOrder.update({
                where: { id },
                data: { paymentStatus: target },
            }),
        ])

        // Fulfillment gate opens when the payment is cleared: reserve + auto
        // pick if the order was never integrated (e.g. bank transfer that was
        // waiting for verification). Never re-emit for an already-reserved
        // order — the MM consumer dedupes, but re-reserving hits the
        // reservation-number unique key noisily.
        if (
            target === 'Paid' &&
            order.channel === 'ECOMMERCE' &&
            !order.lines.some(
                (line) =>
                    line.integrationStatus &&
                    line.integrationStatus !== 'OPEN',
            )
        ) {
            const enriched =
                await this.mmPipeline.enrichOrderForMmIntegration(id)
            if (enriched && this.mmPipeline.isMmLinked(enriched)) {
                await this.mmPipeline.emitSalesOrderConfirmedIntegration(
                    enriched,
                )
            }
        }
        return this.findOne(id)
    }

    /**
     * Can the customer still cancel this order? Only before warehouse
     * processing: nobody may cancel once picking started, packing began,
     * a shipment/invoice exists, goods were issued, or it was delivered.
     */
    private async customerCancellationState(order: {
        id: string
        orderNumber: string
        channel: string
        status: string
        lines: Array<{ integrationStatus: string }>
    }): Promise<{ canCancel: boolean; reason: string | null }> {
        const blocked = (reason: string) => ({ canCancel: false, reason })
        if (order.channel !== 'ECOMMERCE') {
            return blocked('Only online orders can be cancelled by the customer')
        }
        if (order.status === 'CANCELLED') return blocked('Order is already cancelled')
        if (order.status === 'COMPLETED') {
            return blocked(
                'Order is already delivered — please request a return instead',
            )
        }
        if (
            order.lines.some((line) => line.integrationStatus === 'FULFILLED')
        ) {
            return blocked(
                'Order is already delivered — please request a return instead',
            )
        }
        if (order.status !== 'CONFIRMED') {
            return blocked('Order is not in a cancellable state')
        }

        const [goodsIssue, shipment, invoice, startedPick, packing] =
            await Promise.all([
                this.prisma.mmGoodsIssue.findFirst({
                    where: {
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: order.id,
                    },
                    select: { id: true },
                }),
                this.prisma.sdShipment.findFirst({
                    where: { salesOrderId: order.id },
                    select: { id: true },
                }),
                this.prisma.sdSalesInvoice.findFirst({
                    where: { salesOrderId: order.id },
                    select: { id: true },
                }),
                this.prisma.wmPickingTask.findFirst({
                    where: {
                        salesOrderId: order.id,
                        status: { notIn: ['OPEN', 'ASSIGNED'] },
                    },
                    select: { id: true },
                }),
                this.prisma.wmPackage.findFirst({
                    where: { orderNumber: order.orderNumber },
                    select: { id: true },
                }),
            ])
        if (goodsIssue) {
            return blocked(
                'Goods issue already posted — please request a return instead',
            )
        }
        if (shipment) return blocked('Order has been shipped')
        if (invoice) return blocked('Order has been dispatched')
        if (startedPick) return blocked('Picking has already started')
        if (packing) return blocked('Packing has already started')
        return { canCancel: true, reason: null }
    }

    /** Cancellation state for a page of orders (bulk, no N+1). */
    private async customerCancellationMap(
        orders: Array<{
            id: string
            orderNumber: string
            channel: string
            status: string
            lines: Array<{ integrationStatus: string }>
        }>,
    ): Promise<Map<string, { canCancel: boolean; reason: string | null }>> {
        const result = new Map<
            string,
            { canCancel: boolean; reason: string | null }
        >()
        if (!orders.length) return result
        const ids = orders.map((o) => o.id)
        const numbers = orders.map((o) => o.orderNumber)
        const [goodsIssues, shipments, invoices, startedPicks, packing] =
            await Promise.all([
                this.prisma.mmGoodsIssue.findMany({
                    where: {
                        sourceDocumentType: 'SALES_ORDER',
                        sourceDocumentId: { in: ids },
                    },
                    select: { sourceDocumentId: true },
                }),
                this.prisma.sdShipment.findMany({
                    where: { salesOrderId: { in: ids } },
                    select: { salesOrderId: true },
                }),
                this.prisma.sdSalesInvoice.findMany({
                    where: { salesOrderId: { in: ids } },
                    select: { salesOrderId: true },
                }),
                this.prisma.wmPickingTask.findMany({
                    where: {
                        salesOrderId: { in: ids },
                        status: { notIn: ['OPEN', 'ASSIGNED'] },
                    },
                    select: { salesOrderId: true },
                }),
                this.prisma.wmPackage.findMany({
                    where: { orderNumber: { in: numbers } },
                    select: { orderNumber: true },
                }),
            ])
        const issued = new Set(goodsIssues.map((g) => g.sourceDocumentId))
        const shipped = new Set(shipments.map((s) => s.salesOrderId))
        const invoiced = new Set(invoices.map((i) => i.salesOrderId))
        const pickingStarted = new Set(
            startedPicks.map((p) => p.salesOrderId),
        )
        const packed = new Set(packing.map((p) => p.orderNumber))

        for (const order of orders) {
            const blocked = (reason: string) =>
                result.set(order.id, { canCancel: false, reason })
            if (order.channel !== 'ECOMMERCE') {
                blocked('Only online orders can be cancelled by the customer')
                continue
            }
            if (order.status === 'CANCELLED') {
                blocked('Order is already cancelled')
                continue
            }
            if (
                order.status === 'COMPLETED' ||
                order.lines.some(
                    (line) => line.integrationStatus === 'FULFILLED',
                ) ||
                issued.has(order.id)
            ) {
                blocked(
                    'Order is already delivered — please request a return instead',
                )
                continue
            }
            if (shipped.has(order.id)) {
                blocked('Order has been shipped')
                continue
            }
            if (invoiced.has(order.id)) {
                blocked('Order has been dispatched')
                continue
            }
            if (pickingStarted.has(order.id)) {
                blocked('Picking has already started')
                continue
            }
            if (packed.has(order.orderNumber)) {
                blocked('Packing has already started')
                continue
            }
            if (order.status !== 'CONFIRMED') {
                blocked('Order is not in a cancellable state')
                continue
            }
            result.set(order.id, { canCancel: true, reason: null })
        }
        return result
    }

    /**
     * Customer self-service cancellation of an online order before warehouse
     * processing. Releases the reservation through the standard SD→MM cancel
     * event (reserved quantity only — on-hand never changes), cancels open
     * picking tasks, and transitions the demo payment status. Idempotent:
     * an already-cancelled order returns success without releasing twice.
     */
    async cancelRetailOrderForCustomer(
        id: string,
        clientId: string | null,
        dto: CustomerCancelOrderDto,
    ) {
        if (!clientId) {
            throw new UnauthorizedException(
                'Please sign in to cancel your order',
            )
        }
        const order = await this.findOne(id)
        if (order.customerId !== clientId) {
            throw new UnauthorizedException(
                'You can only cancel your own orders',
            )
        }
        // Idempotent: already cancelled → success, nothing is released twice.
        if (order.status === 'CANCELLED') return order

        const gate = await this.customerCancellationState(order)
        if (!gate.canCancel) {
            throw new ConflictException(
                gate.reason ?? 'This order can no longer be cancelled',
            )
        }

        const payment = order.payments?.[0]
        const demoPaid =
            payment !== undefined &&
            ['Paid', 'Authorized'].includes(payment.status ?? '')
        const nextPaymentStatus = payment
            ? demoPaid
                ? 'Refunded Demo'
                : 'Cancelled'
            : null

        // Optimistic lock: a concurrent cancel loses this update and simply
        // returns the already-cancelled order.
        const locked = await this.prisma.sdSalesOrder.updateMany({
            where: { id, status: { not: 'CANCELLED' } },
            data: {
                status: 'CANCELLED',
                ...(nextPaymentStatus
                    ? { paymentStatus: nextPaymentStatus }
                    : {}),
                ...(dto.reason
                    ? {
                          notes: order.notes
                              ? `${order.notes}\nCancelled: ${dto.reason}`
                              : `Cancelled: ${dto.reason}`,
                      }
                    : {}),
            },
        })
        if (locked.count === 0) return this.findOne(id)

        await this.prisma.sdSalesOrderLine.updateMany({
            where: { salesOrderId: id },
            data: { integrationStatus: 'CANCELLED' },
        })
        if (payment && nextPaymentStatus) {
            await this.prisma.sdSalesOrderPayment.update({
                where: { id: payment.id },
                data: { status: nextPaymentStatus },
            })
        }

        // Cancel only tasks that were never started (the gate guarantees all
        // picks are OPEN/ASSIGNED when we get here).
        const picks = await this.prisma.wmPickingTask.findMany({
            where: { salesOrderId: id, status: { in: ['OPEN', 'ASSIGNED'] } },
            select: { id: true, warehouseTaskId: true },
        })
        if (picks.length) {
            await this.prisma.wmPickingTask.updateMany({
                where: { id: { in: picks.map((p) => p.id) } },
                data: { status: 'CANCELLED' },
            })
            const warehouseTaskIds = picks
                .map((p) => p.warehouseTaskId)
                .filter((x): x is string => Boolean(x))
            if (warehouseTaskIds.length) {
                await this.prisma.wmWarehouseTask.updateMany({
                    where: {
                        id: { in: warehouseTaskIds },
                        status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
                    },
                    data: { status: 'CANCELLED', cancelledAt: new Date() },
                })
            }
        }

        // Standard SD→MM cancellation: releases reserved quantity (available
        // stock rises again; on-hand is untouched) and cancels planning
        // demand. The consumer is idempotent per order.
        const updated = await this.findOne(id)
        if (this.mmPipeline.isMmLinked(updated)) {
            await this.sdEvents.emit(
                SD_EVENTS.SALES_ORDER_CANCELLED,
                this.mmPipeline.toEventPayload(updated),
            )
        }
        return updated
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

        // E-commerce freight is server-authoritative: one flat rate per selling
        // division. The storefront cannot pick its own delivery fee.
        const divisionCount = new Set(
            dto.lines.map((l) => l.divisionId).filter(Boolean),
        ).size
        const expectedShipping = money(
            new Decimal(ECOMMERCE_FREIGHT_PHP).times(
                Math.max(1, divisionCount),
            ),
        )
        mismatch('Shipping', expectedShipping, dto.shippingAmount)

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
        sessionClientId: string | null,
    ) {
        if (
            channel !== 'ECOMMERCE' ||
            !divisionIds.some((id) => SIGNED_IN_ECOMMERCE_DIVISIONS.has(id))
        ) {
            return null
        }
        if (!sessionClientId || sessionClientId !== customerId) {
            throw new UnauthorizedException(
                'Please sign in to your account before placing an order.',
            )
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

    async findOne(id: string, companyId?: string) {
        const row = await this.prisma.sdSalesOrder.findUnique({
            where: { id },
            include: {
                ...this.includes,
                payments: { orderBy: { createdAt: 'desc' } },
            },
        })
        if (!row) throw new NotFoundException('Sales order not found')
        // The detail endpoint is company-scoped: refuse orders of another company.
        if (companyId && row.companyId && row.companyId !== companyId) {
            throw new NotFoundException('Sales order not found')
        }
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
            // Self-heal: orders recorded CONFIRMED before MM enrichment (e.g.
            // e-commerce checkout created before pipeline wiring) get one more
            // pass. Enrichment is idempotent; the MM event consumer dedupes.
            await this.mmPipeline.enrichOrderForMmIntegration(id)
            const integrated = await this.findOne(id)
            if (this.mmPipeline.isMmLinked(integrated)) {
                await this.mmPipeline.emitSalesOrderConfirmedIntegration(
                    integrated,
                )
            }
            return integrated
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
     * transaction client so orders created earlier in it are counted. The base
     * number is `max numeric suffix + 1`, so deleting orders never reuses a
     * number and count-based collisions (e.g. `SO-000004-DA6F`) do not happen.
     */
    private async nextOrderNumber(
        prefix = 'SO',
        attempt = 0,
        client: Prisma.TransactionClient = this.prisma,
    ) {
        const rows = await client.sdSalesOrder.findMany({
            where: { orderNumber: { startsWith: `${prefix}-` } },
            select: { orderNumber: true },
        })
        const pattern = new RegExp(`^${prefix}-(\\d{6})$`)
        let max = 0
        for (const row of rows) {
            const match = pattern.exec(row.orderNumber)
            if (match) max = Math.max(max, Number(match[1]))
        }
        const number = `${prefix}-${String(max + 1).padStart(6, '0')}`
        return attempt === 0
            ? number
            : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
    }
}
