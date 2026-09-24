import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class TraceabilityQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    transactionId?: string

    @IsOptional()
    page?: number

    @IsOptional()
    limit?: number
}
