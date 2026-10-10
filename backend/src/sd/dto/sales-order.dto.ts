import {
    ArrayMaxSize,
    ArrayMinSize,
    IsBoolean,
    IsDefined,
    IsEmail,
    IsIn,
    IsInt,
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    IsUrl,
    ValidateNested,
    IsNumber,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

export class CreateSalesOrderLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number
}

/**
 * In-process input for the CRM Closed Won handoff: an ECOMMERCE / CRM draft priced
 * from the SD catalog. Lines reference SD products only; materials, company and
 * warehouse are resolved by SD at confirm.
 */
export interface CreateSalesOrderFromCrmOpportunityInput {
    crmOpportunityId: string
    customerId: string
    /** Exactly one of `lines` (priced from the catalog now) or `quotationId` (frozen quotation prices). */
    lines?: { productId: string; quantity: number }[]
    quotationId?: string
    notes?: string | null
    salesOwnerId?: string | null
    createdBy?: string | null
}

export class CreateSalesOrderDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsOptional()
    @IsString()
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSalesOrderLineDto)
    lines!: CreateSalesOrderLineDto[]
}

export class ChangeSalesOrderLineQtyDto {
    @IsNumber()
    @Min(0)
    quantity!: number
}

export const SALES_ORDER_CHANNELS = ['STANDARD', 'POS', 'ECOMMERCE'] as const
export type SalesOrderChannel = (typeof SALES_ORDER_CHANNELS)[number]
export const RETAIL_SALES_ORDER_CHANNELS = ['POS', 'ECOMMERCE'] as const
export const SALES_ORDER_SOURCES = ['POS', 'WEBSITE', 'CRM', 'ERP'] as const
export type SalesOrderSource = (typeof SALES_ORDER_SOURCES)[number]
/** SdProduct prices carry no currency; they are maintained in this currency. */
export const SD_CATALOG_CURRENCY = 'PHP'
/** Storefront divisions allowed to capture retail orders (AWIC, LPG, MCONPINCO appliances). */
export const RETAIL_SALES_DIVISIONS = [
    'DIV_RETAIL',
    'DIV_LPG',
    'DIV_APPLIANCES',
] as const
export const SALES_ORDER_DATE_RANGES = [
    'today',
    'last7days',
    'last30days',
    'all',
] as const
export type SalesOrderDateRange = (typeof SALES_ORDER_DATE_RANGES)[number]

export class ListSalesOrdersQueryDto {
    @IsOptional()
    @IsIn(SALES_ORDER_CHANNELS)
    channel?: SalesOrderChannel

    @IsOptional()
    @IsIn(SALES_ORDER_SOURCES)
    source?: SalesOrderSource

    /** Matches order number, customer name or customer email (case-insensitive). */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    /** Exact customer (storefront client id), e.g. for a shopper's order history. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    customerId?: string

    /** Organization / MM company scope; orders are filtered by companyId. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    companyId?: string

    @IsOptional()
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId?: string

    /** MM Organization Branch id (created per company). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    branchId?: string

    @IsOptional()
    @IsIn(SALES_ORDER_DATE_RANGES)
    dateRange?: SalesOrderDateRange

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number
}

export class CreateRetailSalesOrderLineDto {
    @IsString()
    @IsNotEmpty()
    sku!: string

    /** Selected variant of the product (required once the product has variants). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    variantId?: string

    /** Variant label snapshot; the backend re-verifies it against the variant master. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    variantName?: string

    @IsString()
    @IsNotEmpty()
    description!: string

    @IsInt()
    @Min(1)
    quantity!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unitPrice!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    lineTotal!: number
}

/** Where an e-commerce order is delivered; stored on the order as a snapshot. */
export class SalesOrderShippingAddressDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    fullName?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(300)
    addressLine1?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    city?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    region?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(20)
    postalCode?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    country?: string
}

/** Priced retail capture (POS fast-track / e-commerce standard) from SD pricing. */
export class CreateRetailSalesOrderDto {
    @IsIn(RETAIL_SALES_ORDER_CHANNELS)
    channel!: (typeof RETAIL_SALES_ORDER_CHANNELS)[number]

    @IsString()
    @IsNotEmpty()
    idempotencyKey!: string

    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]

    /** Required for POS sales; optional for e-commerce (MM Branch id). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    branchId?: string

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsString()
    @IsNotEmpty()
    customerName!: string

    @IsOptional()
    @IsEmail()
    customerEmail?: string

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateRetailSalesOrderLineDto)
    lines!: CreateRetailSalesOrderLineDto[]

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    subtotal!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount!: number

    @IsOptional()
    @IsString()
    promoCode?: string

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    shippingAmount!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    totalAmount!: number

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    paymentReceived?: number

    /** E-commerce delivery address; not used for POS. */
    @IsOptional()
    @ValidateNested()
    @Type(() => SalesOrderShippingAddressDto)
    shippingAddress?: SalesOrderShippingAddressDto

    @IsOptional()
    @IsString()
    createdBy?: string
}

/** Cart item tagged with the selling division; stored on its sales order line. */
export class MarketplaceCheckoutLineDto extends CreateRetailSalesOrderLineDto {
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]
}

/**
 * Marketplace (mixed-division) e-commerce checkout. The whole cart becomes ONE
 * master ECOMMERCE sales order; each line keeps its own `divisionId` and MM
 * splits fulfillment downstream. Idempotent on `checkoutId`.
 */

/** Demo-mode checkout payment methods. Real gateways are NOT connected. */
export const CHECKOUT_PAYMENT_METHODS = [
    'COD',
    'CARD_DEMO',
    'WALLET_DEMO',
    'QR_DEMO',
    'BANK_TRANSFER_DEMO',
] as const
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number]

/** Demo payment record statuses (mirrors `sd_sales_order_payments.status`). */
export const DEMO_PAYMENT_STATUSES = [
    'Pending',
    'Pending Collection',
    'Pending Verification',
    'Authorized',
    'Paid',
    'Failed',
    'Cancelled',
    'Refunded',
] as const
export type DemoPaymentStatus = (typeof DEMO_PAYMENT_STATUSES)[number]

export class CreateMarketplaceCheckoutDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    checkoutId!: string

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsString()
    @IsNotEmpty()
    customerName!: string

    @IsOptional()
    @IsEmail()
    customerEmail?: string

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => MarketplaceCheckoutLineDto)
    cartItems!: MarketplaceCheckoutLineDto[]

    /** Whole-cart charges: Σ line totals, promo discount and per-store delivery. */
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    subtotal!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount!: number

    @IsOptional()
    @IsString()
    promoCode?: string

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    shippingAmount!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    totalAmount!: number

    @IsDefined({ message: 'shippingAddress is required' })
    @ValidateNested()
    @Type(() => SalesOrderShippingAddressDto)
    shippingAddress!: SalesOrderShippingAddressDto

    /** Mode of payment selected at checkout (demo mode — no real gateways). */
    @IsIn(CHECKOUT_PAYMENT_METHODS)
    paymentMethod!: CheckoutPaymentMethod

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    paymentProvider?: string

    /** Demo card simulation: when true the CARD_DEMO payment is recorded Failed. */
    @IsOptional()
    @IsBoolean()
    cardDemoSimulateFailure?: boolean

    @IsOptional()
    @IsString()
    createdBy?: string
}

/**
 * Back-office retail status changes are limited to safe pre-fulfillment
 * cancellation and final closure after SCM has recorded delivery. The service
 * enforces DELIVERED → COMPLETED so callers cannot bypass pick, pack, shipment
 * or goods issue.
 */
export const RETAIL_STATUS_TARGETS = ['COMPLETED', 'CANCELLED'] as const

export class UpdateRetailSalesOrderStatusDto {
    @IsOptional()
    @IsIn(RETAIL_STATUS_TARGETS)
    status?: (typeof RETAIL_STATUS_TARGETS)[number]

    @IsOptional()
    @IsString()
    updatedBy?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    trackingNumber?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    courierName?: string

    @IsOptional()
    @IsUrl({ require_tld: false })
    proofOfDeliveryUrl?: string
}

/** Admin transitions on an order's demo payment record. */
export const ORDER_PAYMENT_TARGETS = [
    'Paid',
    'Failed',
    'Cancelled',
    'Refunded',
] as const
export type OrderPaymentTarget = (typeof ORDER_PAYMENT_TARGETS)[number]

export class UpdateOrderPaymentStatusDto {
    @IsIn(ORDER_PAYMENT_TARGETS)
    status!: OrderPaymentTarget

    @IsOptional()
    @IsString()
    updatedBy?: string
}

/** Customer self-service cancellation (online orders, before warehouse processing). */
export const CUSTOMER_CANCEL_REASONS = [
    'Changed my mind',
    'Wrong item',
    'Wrong address',
    'Payment issue',
    'Other',
] as const
export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number]

export class CustomerCancelOrderDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    reason?: string
}

export class CustomerReturnLineDto {
    @IsString()
    @IsNotEmpty()
    salesOrderLineId!: string

    @IsNumber()
    @Min(0.01)
    quantity!: number

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    conditionNote?: string
}

/** Storefront return request body; ownership and company scope are server-side. */
export class CreateCustomerReturnRequestDto {
    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    conditionNote?: string

    @IsOptional()
    photos?: unknown

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CustomerReturnLineDto)
    lines!: CustomerReturnLineDto[]
}

export class IssueSalesOrderDto {
    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}
