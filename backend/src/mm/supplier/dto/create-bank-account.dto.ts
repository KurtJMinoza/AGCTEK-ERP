import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
} from 'class-validator'

export class CreateBankAccountDto {
    @IsString()
    @IsNotEmpty()
    bankName!: string

    @IsString()
    @IsNotEmpty()
    accountName!: string

    @IsString()
    @IsNotEmpty()
    accountNumber!: string

    @IsOptional()
    @IsString()
    routingNumber?: string

    @IsOptional()
    @IsString()
    swiftCode?: string

    @IsOptional()
    @IsString()
    iban?: string

    @IsOptional()
    @IsString()
    currency?: string

    @IsOptional()
    @IsBoolean()
    isPrimary?: boolean
}
