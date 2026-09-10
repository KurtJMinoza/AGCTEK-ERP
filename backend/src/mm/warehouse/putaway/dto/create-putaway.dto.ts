import { IsString, IsNotEmpty, IsNumber, IsOptional, IsInt, Min } from 'class-validator'

export class CreatePutawayDto {
    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.01)
    quantity!: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string

    @IsOptional()
    @IsString()
    sourceDocument?: string

    @IsOptional()
    @IsString()
    sourceLocation?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    priority?: number
}
