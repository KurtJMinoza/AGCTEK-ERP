import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsString,
    MinLength,
    ValidateNested,
} from 'class-validator'

export class RolePermissionEntryDto {
    @IsString()
    @MinLength(1)
    moduleCode!: string

    @IsBoolean()
    canView!: boolean

    @IsBoolean()
    canCreate!: boolean

    @IsBoolean()
    canRead!: boolean

    @IsBoolean()
    canUpdate!: boolean

    @IsBoolean()
    canDelete!: boolean
}

export class UpdateRolePermissionsDto {
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => RolePermissionEntryDto)
    permissions!: RolePermissionEntryDto[]
}
