import { Type } from 'class-transformer'
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    Min,
    IsIn,
    ValidateNested,
    ArrayMinSize,
    IsOptional,
} from 'class-validator'

export class ConvertPrLineDto {
    @IsString()
    @IsNotEmpty()
    lineId!: string

    @IsIn(['RFQ', 'PO'])
    targetType!: 'RFQ' | 'PO'

    @IsOptional()
    @IsString()
    targetId?: string

    @IsNumber()
    @Min(0.0001)
    convertedQty!: number
}

export class ConvertPurchaseRequisitionDto {
    @ValidateNested({ each: true })
    @Type(() => ConvertPrLineDto)
    @ArrayMinSize(1)
    lines!: ConvertPrLineDto[]
}