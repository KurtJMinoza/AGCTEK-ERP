import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'

export const PUTAWAY_STRATEGY_CODES = [
    'CAPACITY_BASED',
    'FIXED_BIN',
    'NEAREST_BIN',
    'MATERIAL_ZONE',
    'TEMPERATURE_ZONE',
    'FIFO_ZONE',
    'FEFO_ZONE',
] as const

export const PICKING_STRATEGY_CODES = [
    'FIFO',
    'FEFO',
    'ZONE',
    'PRIORITY',
    'BIN_PATH',
] as const

export class CreatePutawayRuleDto {
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() code!: string
    @IsString() @IsNotEmpty() name!: string
    @IsOptional() @IsIn([...PUTAWAY_STRATEGY_CODES]) strategyCode?: string
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) priority?: number
    @IsOptional() @IsString() storageTypeId?: string
    @IsOptional() @IsBoolean() enforceBinCapacity?: boolean
    @IsOptional() @IsBoolean() isActive?: boolean
    @IsOptional() @IsString() notes?: string
}

export class UpdatePutawayRuleDto extends CreatePutawayRuleDto {}

export class CreatePickingRuleDto {
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() code!: string
    @IsString() @IsNotEmpty() name!: string
    @IsOptional() @IsIn([...PICKING_STRATEGY_CODES]) strategyCode?: string
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) priority?: number
    @IsOptional() @IsBoolean() isActive?: boolean
    @IsOptional() @IsString() notes?: string
}

export class UpdatePickingRuleDto extends CreatePickingRuleDto {}
