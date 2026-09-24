import { IsString, IsOptional, MaxLength } from 'class-validator'

export class ReverseTransactionDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    reasonCode?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}
