import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    IsNotEmpty,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { RETAIL_SALES_DIVISIONS } from '../../dto/sales-order.dto'
import { POS_TENDER_METHODS } from '../pos.constants'

/** One tender of a POS sale (a sale may carry several). */
export class PosTenderDto {
    @IsIn(POS_TENDER_METHODS)
    method!: (typeof POS_TENDER_METHODS)[number]

    /** Amount of the sale this tender covers. */
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount!: number

    /** Cash handed over (may exceed `amount` — the surplus is the change). */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    tenderAmount?: number

    @IsOptional()
    @IsString()
    @MaxLength(120)
    referenceNumber?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    provider?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    bankName?: string

    @IsOptional()
    @IsString()
    transactionDate?: string

    @IsOptional()
    @IsString()
    @MaxLength(60)
    employeeNumber?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    payrollReference?: string

    /** Cashier that confirmed the tender; without it the tender stays pending. */
    @IsOptional()
    @IsString()
    verifiedBy?: string
}

/** One cart line of a POS sale. */
export class PosCheckoutLineDto {
    @IsString()
    @IsNotEmpty()
    sku!: string

    @IsOptional()
    @IsString()
    variantId?: string

    @IsOptional()
    @IsString()
    variantName?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    quantity!: number

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unitPrice!: number
}

export class PosCheckoutDto {
    /**
     * Cashier shift that collects the sale. Optional: when the terminal has no
     * shift yet, the server opens one for the register (opening float 0).
     */
    @IsOptional()
    @IsString()
    posSessionId?: string

    /** Company scope of the branch the register sells for. */
    @IsOptional()
    @IsString()
    companyId?: string

    /** Register the terminal runs on. */
    @IsOptional()
    @IsString()
    terminalCode?: string

    /** Guards a repeated checkout of the same cart. */
    @IsString()
    @IsNotEmpty()
    idempotencyKey!: string

    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]

    @IsString()
    @IsNotEmpty()
    branchId!: string

    /** Customer Master id (walk-in customers use the walk-in account). */
    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    customerName?: string

    /** Cashier (User id) serving the terminal. */
    @IsOptional()
    @IsString()
    cashierUserId?: string

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PosCheckoutLineDto)
    lines!: PosCheckoutLineDto[]

    /** Transaction-level discount. */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount?: number

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PosTenderDto)
    tenders!: PosTenderDto[]

    @IsOptional()
    @IsString()
    createdBy?: string
}

/** Void of a completed POS sale. */
export class PosVoidDto {
    /** Why the sale is voided (kept on the sale and in the audit). */
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason!: string

    /** Cashier (User id) that voided the sale. */
    @IsOptional()
    @IsString()
    voidedBy?: string
}

/** Finish a POS sale whose checkout stopped after the order was recorded. */
export class PosCompleteDto {
    /** Cashier (User id) finishing the sale. */
    @IsOptional()
    @IsString()
    completedBy?: string
}

/** A customer typed at the register (existing customer or first-time buyer). */
export class PosCustomerDto {
    /** Name of the customer (an individual or a company). */
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string

    /** Person to contact; defaults to the name. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    contactName?: string

    @IsOptional()
    @IsEmail()
    @MaxLength(200)
    email?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    phone?: string

    /** Defaults to NON_CREDIT (a walk-in cash customer). */
    @IsOptional()
    @IsIn(['NON_CREDIT', 'CREDIT'])
    customerAccountType?: string

    /** Required for a CREDIT account. */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    creditLimit?: number

    @IsOptional()
    @IsString()
    createdBy?: string
}

/**
 * Amount due of a running cart (server-side prices, discount and tax).
 * The terminal quotes the cart before the tender screen so the cashier
 * collects the amount the server will ask for.
 */
export class PosQuoteDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: (typeof RETAIL_SALES_DIVISIONS)[number]

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PosCheckoutLineDto)
    lines!: PosCheckoutLineDto[]

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount?: number
}

export class OpenPosSessionDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    branchId!: string

    @IsString()
    @IsNotEmpty()
    terminalCode!: string

    @IsString()
    @IsNotEmpty()
    cashierUserId!: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    openingCash?: number

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string
}

export class ClosePosSessionDto {
    /** Cash counted in the drawer at close. */
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    countedCash!: number

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string

    @IsOptional()
    @IsString()
    closedBy?: string
}

export class HoldPosSaleDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    posSessionId?: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    customerName?: string

    /** Parked cart: lines and totals captured by the terminal. */
    @IsObject()
    payload!: Record<string, unknown>

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class ListPosSessionsQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsIn(['OPEN', 'CLOSED'])
    status?: string
}

export class ListPosHoldsQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsIn(['HELD', 'RESUMED', 'DISCARDED'])
    status?: string
}
