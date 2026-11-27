import {
    IsArray,
    IsBoolean,
    IsIn,
    IsISO8601,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export const TREASURY_ACCOUNT_KINDS = [
    'BANK',
    'CASH_ON_HAND',
    'BRANCH_CASH',
    'CASHIER_SETTLEMENT',
    'CARD_CLEARING',
    'EWALLET_CLEARING',
] as const

export const SETTLEMENT_TYPES = [
    'CARD_SETTLEMENT',
    'EWALLET_SETTLEMENT',
    'CASH_DEPOSIT',
    'CASH_WITHDRAWAL',
    'INTERNAL_TRANSFER',
    'INCOMING_PAYMENT',
    'OUTGOING_PAYMENT',
] as const

export class FicoTreasuryAccountQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    accountKind?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    paymentMethodCode?: string
}

export class UpsertFicoTreasuryAccountDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    accountCode!: string

    @IsString()
    @IsNotEmpty()
    accountName!: string

    @IsIn(TREASURY_ACCOUNT_KINDS as unknown as string[])
    accountKind!: (typeof TREASURY_ACCOUNT_KINDS)[number]

    @IsString()
    @IsNotEmpty()
    glAccountId!: string

    @IsOptional()
    @IsString()
    currencyCode?: string

    @IsOptional()
    @IsString()
    branchId?: string | null

    @IsOptional()
    @IsString()
    paymentMethodCode?: string | null

    @IsOptional()
    @IsString()
    providerCode?: string | null

    @IsOptional()
    @IsString()
    bankName?: string | null

    @IsOptional()
    @IsString()
    accountNumberMask?: string | null

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE', 'BLOCKED'])
    status?: string

    @IsOptional()
    @IsBoolean()
    postingBlocked?: boolean
}

export class CreateFicoTreasurySettlementDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsIn(SETTLEMENT_TYPES as unknown as string[])
    settlementType!: (typeof SETTLEMENT_TYPES)[number]

    @IsISO8601()
    postingDate!: string

    @IsOptional()
    @IsISO8601()
    valueDate?: string

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.01)
    grossAmount!: number

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0)
    feeAmount?: number

    @IsString()
    currencyCode!: string

    @IsOptional()
    @IsString()
    fromTreasuryAccountId?: string

    @IsOptional()
    @IsString()
    toTreasuryAccountId?: string

    @IsOptional()
    @IsString()
    paymentMethodCode?: string

    @IsOptional()
    @IsString()
    providerCode?: string

    @IsOptional()
    @IsString()
    reference?: string

    @IsOptional()
    @IsString()
    idempotencyKey?: string
}

export class ImportBankStatementLineDto {
    @IsString()
    treasuryAccountId!: string

    @IsISO8601()
    statementDate!: string

    @IsNumber({ maxDecimalPlaces: 4 })
    amount!: number

    @IsIn(['DEBIT', 'CREDIT'])
    direction!: 'DEBIT' | 'CREDIT'

    @IsString()
    externalId!: string

    @IsOptional()
    @IsString()
    reference?: string
}

export class ImportBankStatementDto {
    @IsString()
    companyId!: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportBankStatementLineDto)
    lines!: ImportBankStatementLineDto[]
}

export class FicoTaxReconciliationQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsISO8601()
    fromDate?: string

    @IsOptional()
    @IsISO8601()
    toDate?: string
}

export class ResolvePaymentAccountQueryDto {
    @IsString()
    companyId!: string

    @IsString()
    paymentMethodCode!: string

    @IsString()
  currencyCode!: string

    @IsISO8601()
    postingDate!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    providerCode?: string

    @IsOptional()
    @IsString()
    treasuryAccountId?: string

    @IsOptional()
    @IsIn(['DEBIT', 'CREDIT'])
    side?: 'DEBIT' | 'CREDIT'
}