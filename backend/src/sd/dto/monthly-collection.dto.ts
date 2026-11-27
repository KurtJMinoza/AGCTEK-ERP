import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class MonthlyCollectionQueryDto {
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year!: number

    /** 1–12; omit for the full year (TOTAL + all months). */
    @Type(() => Number)
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(12)
    month?: number
}