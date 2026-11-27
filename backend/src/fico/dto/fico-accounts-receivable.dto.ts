import {
    IsBoolean,
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator'
import { Transform } from 'class-transformer'

export class FicoArCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string
}

export class FicoArOpenItemQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    overdueOnly?: boolean

    @IsOptional()
    @IsDateString()
    asOfDate?: string
}

export class FicoArDocumentQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string
}

export class FicoArAgingQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsDateString()
    asOfDate?: string
}
