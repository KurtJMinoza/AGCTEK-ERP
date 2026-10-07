import { Transform, Type } from 'class-transformer'
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator'
import { ROLE_CODE_PATTERN } from '../../auth/auth.constants'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class CreateRoleDto {
    @Transform(trim)
    @Matches(ROLE_CODE_PATTERN, {
        message: 'code must be 2-50 lowercase letters, digits or underscores, starting with a letter',
    })
    code!: string

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string

    /** Existing role whose permissions are copied once; no link is kept. */
    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: 'copyFrom must be a valid role code' })
    copyFrom?: string

    /** Template whose permissions are copied once; later template edits never change the role. */
    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: 'copyFromTemplate must be a valid template code' })
    copyFromTemplate?: string
}

export class CreateRoleTemplateDto {
    @Transform(trim)
    @Matches(ROLE_CODE_PATTERN, {
        message: 'code must be 2-50 lowercase letters, digits or underscores, starting with a letter',
    })
    code!: string

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string

    /** "Save role as template": snapshot of this role's permissions. */
    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: 'fromRole must be a valid role code' })
    fromRole?: string

    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: 'fromTemplate must be a valid template code' })
    fromTemplate?: string
}

export class UpdateRoleDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string
}

export class RolePermissionEntryDto {
    @IsString()
    @MinLength(1)
    resourceCode!: string

    @IsBoolean()
    canRead!: boolean

    @IsBoolean()
    canCreate!: boolean

    @IsBoolean()
    canUpdate!: boolean

    @IsBoolean()
    canDelete!: boolean
}

export class UpdateRolePermissionsDto {
    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => RolePermissionEntryDto)
    permissions!: RolePermissionEntryDto[]
}
