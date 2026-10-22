import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'

export class ListBackordersQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    customerId?: string

    /** Product category = sales division, e.g. DIV_LPG. */
    @IsOptional()
    @IsString()
    @MaxLength(50)
    divisionId?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    pageSize?: number
}
