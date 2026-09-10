import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
} from 'class-validator'

export class CreateSupplierCategoryDto {
    @IsOptional()
    @IsString()
    code?: string

    @IsString()
    @IsNotEmpty()
    name!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsInt()
    sortOrder?: number
}
