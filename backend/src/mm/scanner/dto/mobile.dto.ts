import {
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    ArrayMaxSize,
    ArrayMinSize,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ScannerEventDto } from './scanner.dto'

export class RegisterDeviceDto {
    @IsString()
    @IsNotEmpty()
    deviceCode!: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    userId?: string

    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    platform?: string
}

export class MobileResolveDto {
    @IsString()
    @IsNotEmpty()
    barcode!: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    deviceId?: string

    @IsOptional()
    @IsString()
    userId?: string

    @IsOptional()
    @IsString()
    sessionToken?: string
}

export class MobileSyncDto {
    @IsString()
    @IsNotEmpty()
    deviceId!: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    userId?: string

    @IsOptional()
    @IsString()
    sessionToken?: string

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ScannerEventDto)
    events!: ScannerEventDto[]
}
