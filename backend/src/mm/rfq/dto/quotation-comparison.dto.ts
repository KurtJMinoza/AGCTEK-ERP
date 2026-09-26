import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator'

export class SaveQuotationComparisonDto {
    @IsString()
    @IsNotEmpty()
    rfqId!: string

    @IsOptional()
    @IsString()
    comparedBy?: string

    @IsOptional()
    @IsArray()
    criteria?: string[]

    @IsOptional()
    @IsString()
    selectedQuotationId?: string

    @IsOptional()
    @IsString()
    selectionReason?: string
}
