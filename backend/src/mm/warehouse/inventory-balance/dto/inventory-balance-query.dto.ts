import { IsOptional, IsString } from 'class-validator'

export class InventoryBalanceQueryDto {
    @IsOptional()
    @IsString()
    binId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string
}
