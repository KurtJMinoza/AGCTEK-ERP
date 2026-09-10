import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
    IsNumber,
    Min,
} from 'class-validator'

export class CreatePaymentTermsDto {
    @IsOptional()
    @IsString()
    code?: string

    @IsString()
    @IsNotEmpty()
    name!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsInt()
    @Min(0)
    dueDays!: number

    @IsOptional()
    @IsInt()
    @Min(0)
    discountDays?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    discountPercent?: number
}
