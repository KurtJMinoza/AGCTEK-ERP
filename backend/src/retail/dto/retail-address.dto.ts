import { Transform } from 'class-transformer'
import {
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator'

const trimOptional = (value: unknown) =>
    typeof value === 'string' ? value.trim() : value

/** Address types deliberately remain extensible; add the next type here and in the UI. */
export const RETAIL_ADDRESS_TYPES = ['HOME', 'WORK'] as const
export type RetailAddressType = (typeof RETAIL_ADDRESS_TYPES)[number]

export class RetailAddressUpsertDto {
    @IsIn(RETAIL_ADDRESS_TYPES)
    addressType!: RetailAddressType

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(500)
    formattedAddress?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(250)
    addressLine?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    barangayOrNeighborhood?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    cityOrMunicipality?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    provinceOrState?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(32)
    postalCode?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(120)
    country?: string

    @IsNumber({ maxDecimalPlaces: 8 })
    @Min(-90)
    @Max(90)
    latitude!: number

    @IsNumber({ maxDecimalPlaces: 8 })
    @Min(-180)
    @Max(180)
    longitude!: number

    /** Shopper-entered delivery detail. Never replaced by reverse geocoding. */
    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(1000)
    additionalInfo?: string

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean
}

/** Optional update shape avoids changing the existing Jest/CommonJS setup. */
export class RetailUpdateAddressDto {
    @IsOptional()
    @IsIn(RETAIL_ADDRESS_TYPES)
    addressType?: RetailAddressType

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(500)
    formattedAddress?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(250)
    addressLine?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    barangayOrNeighborhood?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    cityOrMunicipality?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(160)
    provinceOrState?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(32)
    postalCode?: string

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(120)
    country?: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 8 })
    @Min(-90)
    @Max(90)
    latitude?: number

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 8 })
    @Min(-180)
    @Max(180)
    longitude?: number

    @IsOptional()
    @Transform(({ value }) => trimOptional(value))
    @IsString()
    @MaxLength(1000)
    additionalInfo?: string

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean
}
