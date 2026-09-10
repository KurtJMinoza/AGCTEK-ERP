import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    MaxLength,
    IsIn,
} from 'class-validator'

export class CreateStorageTypeDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    code!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsBoolean()
    temperatureControlled?: boolean

    @IsOptional()
    @IsBoolean()
    hazardous?: boolean

    @IsOptional()
    @IsBoolean()
    pickingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    putawayAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    receivingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    shippingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    qualityControlled?: boolean

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
