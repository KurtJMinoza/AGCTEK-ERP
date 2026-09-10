import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsNumber,
    Min,
    MaxLength,
    IsIn,
} from 'class-validator'

export class CreateStorageBinDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    code!: string

    @IsString()
    @IsNotEmpty()
    storageSectionId!: string

    @IsOptional()
    @IsString()
    barcode?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    capacityQuantity?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    capacityWeight?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    capacityVolume?: number

    @IsOptional()
    @IsString()
    weightUom?: string

    @IsOptional()
    @IsString()
    volumeUom?: string

    @IsOptional()
    @IsBoolean()
    pickingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    putawayAllowed?: boolean

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
