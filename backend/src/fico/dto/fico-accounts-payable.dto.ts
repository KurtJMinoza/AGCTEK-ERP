import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string
}

export class UpsertSupplierCompanyAccountDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    @MaxLength(80)
    supplierAccountGroup?: string

    @IsOptional()
    @IsString()
    reconciliationAccountId?: string | null

    @IsOptional()
    @IsString()
    paymentTermsId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(80)
    defaultPaymentMethodCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(3)
    transactionCurrencyCode?: string | null

    @IsOptional()
    @IsString()
    defaultPurchaseTaxCodeId?: string | null

    @IsOptional()
    @IsString()
    withholdingTaxCodeId?: string | null

    @IsOptional()
    @IsString()
    taxIdentificationNumber?: string | null

    @IsOptional()
    @IsString()
    taxClassification?: string | null

    @IsOptional()
    @IsNumber()
    @Min(0)
    invoiceToleranceAmount?: number | null

    @IsOptional()
    @IsNumber()
    @Min(0)
    invoiceTolerancePercent?: number | null

    @IsOptional()
    @IsBoolean()
    postingBlocked?: boolean

    @IsOptional()
    @IsBoolean()
    paymentBlocked?: boolean

    @IsOptional()
    @IsString()
    alternativePayeeSupplierId?: string | null

    @IsOptional()
    @IsBoolean()
    alternativePayeeAuthorized?: boolean

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: 'ACTIVE' | 'INACTIVE'
}

export class UpsertSupplierBankApprovalDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE', 'REVOKED'])
    status?: 'ACTIVE' | 'INACTIVE' | 'REVOKED'

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    @IsOptional()
    @IsString()
    remarks?: string
}

export class FicoApOpenItemQueryDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    overdueOnly?: boolean

    @IsOptional()
    @IsDateString()
    asOfDate?: string
}

export class FicoApStatementQueryDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string
}

export class FicoApDashboardQueryDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsDateString()
    asOfDate?: string

    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string
}

/** Non-PO and expense supplier invoices posted directly in FICO (no MM procurement document). */
export class CreateFicoApDirectInvoiceDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsIn(['EXPENSE_INVOICE', 'NON_PO_INVOICE'])
    invoiceKind!: 'EXPENSE_INVOICE' | 'NON_PO_INVOICE'

    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    supplierInvoiceNumber!: string

    @IsDateString()
    documentDate!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsDateString()
    baselineDate?: string

    @IsOptional()
    @IsDateString()
    dueDate?: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsNumber()
    @Min(0.0001)
    grossAmount!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    taxAmount?: number

    @IsOptional()
    @IsString()
    taxCodeId?: string

    @IsOptional()
    @IsString()
    withholdingTaxCodeId?: string

    @IsOptional()
    @IsBoolean()
    paymentBlocked?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string
}

export class FicoApPaymentAllocationDto {
    @IsString()
    @IsNotEmpty()
    openItemId!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number
}

export class CreateFicoApPaymentDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsDateString()
    paymentDate!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsOptional()
    @IsString()
    paymentMethodCode?: string

    @IsOptional()
    @IsString()
    bankAccountId?: string

    @IsOptional()
    @IsString()
    supplierBankApprovalId?: string

    @IsOptional()
    @IsString()
    @MaxLength(160)
    paymentReference?: string

    /** Client retry key. When omitted, the exact allocation payload is used. */
    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => FicoApPaymentAllocationDto)
    allocations!: FicoApPaymentAllocationDto[]
}

/** AP-originated document types that must create an immutable supplier open item. */
export class CreateFicoApAdjustmentDto extends FicoApCompanyQueryDto {
    @IsIn(['CREDIT_MEMO', 'DEBIT_ADJUSTMENT', 'ADVANCE'])
    documentType!: 'CREDIT_MEMO' | 'DEBIT_ADJUSTMENT' | 'ADVANCE'

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsDateString()
    documentDate!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsDateString()
    baselineDate?: string

    @IsOptional()
    @IsDateString()
    dueDate?: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number

    @IsOptional()
    @IsString()
    @MaxLength(160)
    referenceNumber?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string

    @IsOptional()
    @IsBoolean()
    paymentBlocked?: boolean

    /** Required for advances when the approved bank determination is dimensioned by method. */
    @IsOptional()
    @IsString()
    @MaxLength(80)
    paymentMethodCode?: string

    @IsOptional()
    @IsString()
    bankAccountId?: string

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string
}

export class FicoApClearingAllocationDto {
    @IsString()
    @IsNotEmpty()
    debitOpenItemId!: string

    @IsString()
    @IsNotEmpty()
    creditOpenItemId!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number
}

/** Clears a supplier credit memo or advance against one or more supplier liabilities. */
export class CreateFicoApClearingDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsDateString()
    clearingDate!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsOptional()
    @IsString()
    @MaxLength(160)
    reference?: string

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => FicoApClearingAllocationDto)
    allocations!: FicoApClearingAllocationDto[]
}

export class CreateFicoApHistoricalMigrationRunDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string
}

/** One supplier payable balance in an approved, controlled AP migration run. */
export class CreateFicoApHistoricalBalanceDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsDateString()
    documentDate!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsDateString()
    dueDate?: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number

    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    referenceNumber!: string

    @IsOptional()
    @IsBoolean()
    paymentBlocked?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string
}

export class ReverseFicoApDocumentDto extends FicoApCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason!: string

    @IsOptional()
    @IsDateString()
    postingDate?: string
}

export class FicoApDocumentQueryDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    documentType?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    search?: string
}

export class FicoApPaymentQueryDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    status?: string
}

export class FicoApClearingQueryDto extends FicoApCompanyQueryDto {
    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    status?: string
}

export class SetFicoApPaymentBlockDto extends FicoApCompanyQueryDto {
    @IsBoolean()
    blocked!: boolean

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string
}
