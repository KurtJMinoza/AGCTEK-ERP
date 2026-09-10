import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator'

export class TransactionQueryDto {
    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsString()
    movementType?: string

    @IsOptional()
    @IsString()
    stockStatus?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string

    /** all | original | reversals */
    @IsOptional()
    @IsString()
    reversalFilter?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number
}
