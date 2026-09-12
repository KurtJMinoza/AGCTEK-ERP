import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateCompanyDto {
    @IsString()
    @MinLength(1)
    code!: string

    @IsString()
    @MinLength(1)
    name!: string
}

export class UpdateCompanyDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    code?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    name?: string
}

export class CreatePlantDto {
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

export class UpdatePlantDto {
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
    @IsString()
    plantId?: string

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
    @IsString()
    plantId?: string | null

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
