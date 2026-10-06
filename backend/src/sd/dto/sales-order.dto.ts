import {
    ArrayMaxSize,
    ArrayMinSize,
    IsDefined,
    IsEmail,
    IsIn,
    IsInt,
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
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
/**
 * Selling branch codes (mirrors `src/modules/sd/catalogs/branchCatalog.ts`).
 * Plain codes until stores are modelled in the MM `Branch` master.
 */
export const RETAIL_BRANCH_IDS = [
    'BR_AWIC_DAVAO_MAIN',
    'BR_MCONPINCO_01',
    'BR_LPG_01',
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

    @IsOptional()
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId?: string

    @IsOptional()
    @IsIn(RETAIL_BRANCH_IDS)
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
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    fullName!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(40)
    phone!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(300)
    addressLine1!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    city!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    region!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    postalCode!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    country!: string
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

    /** Required for POS sales; optional for e-commerce. */
    @IsOptional()
    @IsIn(RETAIL_BRANCH_IDS)
    branchId?: (typeof RETAIL_BRANCH_IDS)[number]

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

/** Cart line tagged with the selling division; the server splits orders on it. */
export class MarketplaceCheckoutLineDto extends CreateRetailSalesOrderLineDto {
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]
}

/** One store's charges (verified against its lines) for its share of the cart. */
export class MarketplaceStoreChargesDto {
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]

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
}

/**
 * Marketplace (mixed-division) e-commerce checkout. Lines are grouped by their
 * `divisionId` into one ECOMMERCE sales order per division, created in a single
 * transaction and sharing `correlationId = checkoutId`. Idempotent on `checkoutId`.
 */
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
    lines!: MarketplaceCheckoutLineDto[]

    /** Exactly one entry per division present in `lines`. */
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(RETAIL_SALES_DIVISIONS.length)
    @ValidateNested({ each: true })
    @Type(() => MarketplaceStoreChargesDto)
    stores!: MarketplaceStoreChargesDto[]

    /** Copied onto every division's order so each store can deliver independently. */
    @IsDefined({ message: 'shippingAddress is required' })
    @ValidateNested()
    @Type(() => SalesOrderShippingAddressDto)
    shippingAddress!: SalesOrderShippingAddressDto

    @IsOptional()
    @IsString()
    createdBy?: string
}

export const RETAIL_STATUS_TARGETS = ['COMPLETED', 'CANCELLED'] as const

export class UpdateRetailSalesOrderStatusDto {
    @IsIn(RETAIL_STATUS_TARGETS)
    status!: (typeof RETAIL_STATUS_TARGETS)[number]

    @IsOptional()
    @IsString()
    updatedBy?: string
}

export class IssueSalesOrderDto {
    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}
