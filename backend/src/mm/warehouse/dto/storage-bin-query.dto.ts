import { IsOptional, IsString, IsIn } from 'class-validator'

export class StorageBinQueryDto {
    @IsOptional()
    @IsString()
    storageSectionId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
