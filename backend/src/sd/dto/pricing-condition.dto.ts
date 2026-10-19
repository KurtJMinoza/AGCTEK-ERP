import { Type } from 'class-transformer'
import {
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator'

export const PRICING_TABS = ['BASE_PRICE', 'TIER_DISCOUNT', 'PROMO'] as const
export type PricingTab = (typeof PRICING_TABS)[number]

export const PRICING_CONDITION_TYPES = ['TIER_DISCOUNT', 'PROMO'] as const
export type PricingConditionType = (typeof PRICING_CONDITION_TYPES)[number]

export const PRICING_VALUE_TYPES = ['PERCENT_OFF', 'FIXED_PRICE'] as const
export type PricingValueType = (typeof PRICING_VALUE_TYPES)[number]

export const PRICING_CUSTOMER_TYPES = ['ALL', 'RETAIL', 'B2B'] as const
export type PricingCustomerType = (typeof PRICING_CUSTOMER_TYPES)[number]

export class ListPricingConditionsQueryDto {
    @IsOptional()
    @IsIn(PRICING_TABS)
    tab?: PricingTab

    /** SKU, product name or condition code. */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    pageSize?: number
}

export class CreatePricingConditionDto {
    @IsIn(PRICING_CONDITION_TYPES)
    conditionType!: PricingConditionType

    /** Generated (DISC01, PROMO01 …) when omitted. */
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z0-9_-]{2,20}$/, {
        message: 'Condition code: 2–20 upper-case letters, digits, - or _',
    })
    conditionCode?: string

    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string

    /** Omit to apply to every product. */
    @IsOptional()
    @IsString()
    productId?: string | null

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @IsPositive()
    minQuantity?: number | null

    @IsOptional()
    @IsIn(PRICING_CUSTOMER_TYPES)
    customerType?: PricingCustomerType

    @IsIn(PRICING_VALUE_TYPES)
    valueType!: PricingValueType

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    value!: number

    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
        message: 'Promo code: 3–30 letters, digits, - or _',
    })
    promoCode?: string | null

    @IsDateString()
    validFrom!: string

    @IsOptional()
    @IsDateString()
    validTo?: string | null
}

export class UpdatePricingConditionDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string

    @IsOptional()
    @IsString()
    productId?: string | null

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @IsPositive()
    minQuantity?: number | null

    @IsOptional()
    @IsIn(PRICING_CUSTOMER_TYPES)
    customerType?: PricingCustomerType

    @IsOptional()
    @IsIn(PRICING_VALUE_TYPES)
    valueType?: PricingValueType

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    value?: number

    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
        message: 'Promo code: 3–30 letters, digits, - or _',
    })
    promoCode?: string | null

    @IsOptional()
    @IsDateString()
    validFrom?: string

    @IsOptional()
    @IsDateString()
    validTo?: string | null
}

export class UpdateBasePriceDto {
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    price!: number
}
