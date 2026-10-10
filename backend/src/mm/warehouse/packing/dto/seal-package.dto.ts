import { IsOptional, IsNumber, Min } from 'class-validator'

/** Optional package measurements captured when sealing (Weight kg / L × W × H cm). */
export class SealPackageDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    weight?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    length?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    width?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    height?: number
}
