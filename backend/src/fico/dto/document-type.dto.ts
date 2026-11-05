import { PartialType } from '@nestjs/mapped-types'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateFiDocumentTypeDto {
    @IsString() @IsNotEmpty() @MaxLength(8) code!: string
    @IsString() @IsNotEmpty() @MaxLength(120) name!: string
    @IsOptional() @IsString() @MaxLength(12) prefix?: string
    @Type(() => Number) @IsInt() @Min(1) numberRangeFrom!: number
    @Type(() => Number) @IsInt() @Min(1) numberRangeTo!: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) nextNumber?: number
    @IsOptional() @IsBoolean() allowsManualEntry?: boolean
    @IsOptional() @IsBoolean() isActive?: boolean
}
export class UpdateFiDocumentTypeDto extends PartialType(CreateFiDocumentTypeDto) {}
