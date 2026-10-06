import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateCompanyDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(200)
    name!: string

    @IsString()
    @MinLength(1)
    @MaxLength(500)
    address!: string

    @IsString()
    @MinLength(1)
    @MaxLength(32)
    tin!: string
}

export class UpdateCompanyDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    name?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(500)
    address?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    tin?: string
}

export class CreateBranchDto {
    @IsString()
    @MinLength(1)
    code!: string

    @IsString()
    @MinLength(1)
    name!: string

    @IsString()
    @MinLength(1)
    companyId!: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}

export class UpdateBranchDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    code?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    name?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    companyId?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
