import { Transform, Type } from 'class-transformer'
import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

export class SalesReturnLineDto {
    @IsString()
    @IsNotEmpty()
    salesOrderLineId!: string

    /** Optional cross-check: must match the resolved order line's material. */
    @IsOptional()
    @IsString()
    materialId?: string

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.000001)
    quantity!: number
}

export class CreateSalesReturnDto {
    @IsString()
    @IsNotEmpty()
    salesOrderId!: string

    /** Derived from the order when omitted; must match the order when supplied. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    companyId?: string

    /** SCM damage report that initiated this return — unique, so retries never duplicate. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    damageReportId?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    reason?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    notes?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SalesReturnLineDto)
    lines!: SalesReturnLineDto[]
}

export class ListSalesReturnsQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    salesOrderId?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    pageSize?: number
}

export class SalesReturnActionDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    reason?: string
}

export class InitiateMmIntakeLineDto {
    @IsString()
    @IsNotEmpty()
    salesReturnLineId!: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    unitCost?: number
}

/** Optional physical intake details (SD → MM handoff). Warehouse defaults to the return's. */
export class InitiateMmIntakeDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    warehouseId?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    remarks?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InitiateMmIntakeLineDto)
    lines?: InitiateMmIntakeLineDto[]
}
