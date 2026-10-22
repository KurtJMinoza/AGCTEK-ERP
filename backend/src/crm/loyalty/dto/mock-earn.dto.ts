import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Transform } from 'class-transformer'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/** Demo / staging earn: a sales order (preferred, idempotent per order) or an explicit grant. */
export class MockEarnDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1_000_000)
    points?: number

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    salesOrderId?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    note?: string
}
