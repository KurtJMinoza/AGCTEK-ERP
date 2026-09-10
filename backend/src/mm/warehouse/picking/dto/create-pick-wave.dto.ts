import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsIn,
    IsArray,
    IsInt,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreatePickWaveDto {
    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsIn(['FIFO', 'FEFO', 'LIFO', 'PRIORITY', 'ZONE', 'NEAREST', 'NEAREST_BIN', 'WAVE'])
    strategy?: string

    /** Zone filter (section/type code) when strategy is ZONE or WAVE */
    @IsOptional()
    @IsString()
    zoneCode?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    taskIds?: string[]

    /** Open reservation IDs to generate pick tasks into this wave */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    reservationIds?: string[]
}
