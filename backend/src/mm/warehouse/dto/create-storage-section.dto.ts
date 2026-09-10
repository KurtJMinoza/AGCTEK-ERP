import {
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
    IsIn,
} from 'class-validator'

export class CreateStorageSectionDto {
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
    storageTypeId!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
