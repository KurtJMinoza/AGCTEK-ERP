import { Type } from 'class-transformer'
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'
import { BILLING_STATUSES, type BillingStatus } from '../sales-invoice-billing'

export class ListSalesInvoicesQueryDto {
    @IsOptional()
    @IsIn(BILLING_STATUSES)
    status?: BillingStatus

    /** Invoice number, sales order number or customer name / email. */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    pageSize?: number
}
