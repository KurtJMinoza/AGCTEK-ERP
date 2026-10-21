import { Type } from 'class-transformer'
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'
import { DELIVERY_STAGES, type DeliveryStage } from '../delivery-monitor.service'

export class ListDeliveriesQueryDto {
    @IsOptional()
    @IsIn(DELIVERY_STAGES)
    stage?: DeliveryStage

    /** Delivery / sales order number, customer name/code, SKU or product name. */
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
