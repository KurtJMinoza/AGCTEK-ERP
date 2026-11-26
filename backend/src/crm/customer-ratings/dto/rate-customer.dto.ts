import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Transform } from 'class-transformer'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

export class RateCustomerDto {
    @IsInt()
    @Min(1)
    @Max(5)
    stars!: number

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    comment?: string
}
