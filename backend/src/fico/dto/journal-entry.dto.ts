import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator'

export class JournalEntryLineDto {
    @IsString() @IsNotEmpty() glAccountId!: string
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) debit!: number
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) credit!: number
    @IsOptional() @IsString() @MaxLength(500) text?: string
}
export class CreateJournalEntryDto {
    @IsString() @IsNotEmpty() documentTypeId!: string
    @IsDateString() postingDate!: string
    @IsDateString() documentDate!: string
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() reference?: string
    @IsOptional() @IsString() headerText?: string
    @IsString() @MaxLength(3) currencyCode!: string
    @IsOptional() @IsIn(['DRAFT', 'POSTED']) status?: 'DRAFT' | 'POSTED'
    @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JournalEntryLineDto) lines!: JournalEntryLineDto[]
}
export class ListJournalEntriesQueryDto {
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsIn(['DRAFT', 'POSTED', 'REVERSED']) status?: string
    @IsOptional() @IsString() documentTypeId?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
}
export class ReverseJournalEntryDto { @IsOptional() @IsDateString() postingDate?: string }
