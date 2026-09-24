import { IsOptional, IsString, IsNotEmpty } from 'class-validator'

export class OpenPackingSessionDto {
    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    pickingTaskId?: string

    @IsOptional()
    @IsString()
    warehouseTaskId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class PackingSessionQueryDto {
    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    status?: string
}
