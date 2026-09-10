import { IsOptional, IsString, IsNumber, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class PurchaseOrderQueryDto {
    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    buyerId?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    pageSize?: number
}
