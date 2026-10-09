import {
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
    IsIn,
} from 'class-validator'

export class CreateStorageShelfDto {
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
    storageSectionId!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
