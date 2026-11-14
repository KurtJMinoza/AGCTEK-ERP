import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

// ── Sales Source CRUD ──

export class CreateSalesSourceDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    @Transform(trim)
    code!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(trim)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(30)
    badgeColor?: string
}

export class UpdateSalesSourceDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(trim)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(30)
    badgeColor?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @IsInt()
    sortOrder?: number
}

// ── Ext Platform Transaction CRUD ──

/** A sold SD Product Catalog item; the MM material is resolved server-side. */
export class ExtPlatformTransactionLineDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    /** Required for VARIABLE products (the sold option combination). */
    @IsOptional()
    @IsString()
    variantId?: string

    @IsNumber()
    @Min(0.0001)
    quantity!: number

    @IsOptional()
    @IsString()
    uomId?: string

    @IsNumber()
    @Min(0)
    unitPrice!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount?: number

    @IsOptional()
    @IsString()
    description?: string
}

export class CreateExtPlatformTransactionDto {
    @IsString()
    @IsNotEmpty()
    salesSourceId!: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    externalPlatformName?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    externalOrderRef?: string

    @IsString()
    @IsNotEmpty()
    transactionDate!: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    customerName?: string

    @IsOptional()
    @IsString()
    @MaxLength(10)
    currency?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    paymentMethod?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    settlementReference?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    platformFees?: number

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    remarks?: string

    @IsOptional()
    @IsBoolean()
    isCompanyInventory?: boolean

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ExtPlatformTransactionLineDto)
    lines!: ExtPlatformTransactionLineDto[]

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class UpdateExtPlatformTransactionDto {
    @IsOptional()
    @IsString()
    salesSourceId?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    externalPlatformName?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    externalOrderRef?: string

    @IsOptional()
    @IsString()
    transactionDate?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    customerName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    paymentMethod?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(trim)
    settlementReference?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    platformFees?: number

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    remarks?: string

    @IsOptional()
    @IsBoolean()
    isCompanyInventory?: boolean

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtPlatformTransactionLineDto)
    lines?: ExtPlatformTransactionLineDto[]

    @IsOptional()
    @IsString()
    updatedBy?: string
}

export class ExtPlatformStockItemDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    @IsOptional()
    @IsString()
    variantId?: string
}

/** Live MM availability of catalog items for the entry form. */
export class ExtPlatformStockQueryDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(2000)
    @ValidateNested({ each: true })
    @Type(() => ExtPlatformStockItemDto)
    items!: ExtPlatformStockItemDto[]
}

/** Tax determination dry-run for the entry form; nothing is persisted. */
export class PreviewExtPlatformTransactionDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    /** Company-owned stock is limited by MM availability; third-party stock is not. */
    @IsOptional()
    @IsBoolean()
    isCompanyInventory?: boolean

    @IsString()
    @IsNotEmpty()
    transactionDate!: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    platformFees?: number

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ExtPlatformTransactionLineDto)
    lines!: ExtPlatformTransactionLineDto[]
}

export const EXT_PLATFORM_TX_STATUSES = [
    'DRAFT',
    'CONFIRMED',
    'APPROVED',
    'CANCELLED',
] as const
export type ExtPlatformTxStatus = (typeof EXT_PLATFORM_TX_STATUSES)[number]

export class UpdateExtPlatformTransactionStatusDto {
    @IsIn(['CONFIRMED', 'APPROVED', 'CANCELLED'])
    status!: 'CONFIRMED' | 'APPROVED' | 'CANCELLED'

    @IsOptional()
    @IsString()
    updatedBy?: string
}

export class ListExtPlatformTransactionsQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    salesSourceId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsIn(EXT_PLATFORM_TX_STATUSES)
    status?: ExtPlatformTxStatus

    @IsOptional()
    @IsString()
    @MaxLength(200)
    search?: string

    @IsOptional()
    @IsString()
    from?: string

    @IsOptional()
    @IsString()
    to?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    offset?: number
}
