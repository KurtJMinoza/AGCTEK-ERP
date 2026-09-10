import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator'

export class ScanItemDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    quantity?: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}
