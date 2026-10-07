import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDefined,
    IsString,
    MinLength,
    ValidateNested,
} from 'class-validator'

export class SystemSettingUpdateDto {
    @IsString()
    @MinLength(1)
    key!: string

    /** Type-checked against the setting's valueType in SystemSettingsService. */
    @IsDefined()
    value!: boolean | string | number
}

export class UpdateSystemSettingsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => SystemSettingUpdateDto)
    settings!: SystemSettingUpdateDto[]
}
