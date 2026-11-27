import { Type } from 'class-transformer'
import {
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator'

/** Record marketplace payout (settlement policy A — fees at payout). */
export class RecordExtPlatformSettlementDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    treasuryAccountId!: string

    @IsOptional()
    @IsDateString()
    postingDate?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    actualPlatformFees?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    actualPayout?: number

    @IsOptional()
    @IsString()
    @MaxLength(120)
    settlementReference?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    idempotencyKey?: string
}