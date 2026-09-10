import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    IsInt,
    Min,
    ValidateIf,
} from 'class-validator'

/** Treat blank strings as absent so optional validators don't fire. */
const ifPresent = (_: unknown, v: unknown) =>
    v !== undefined && v !== null && v !== ''

export class CreateSupplierDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierName!: string

    @IsOptional()
    @IsString()
    legalName?: string

    @IsOptional()
    @IsString()
    supplierType?: string

    @IsOptional()
    @IsString()
    taxId?: string

    @IsOptional()
    @IsString()
    primaryContact?: string

    @ValidateIf(ifPresent)
    @IsEmail()
    email?: string

    @IsOptional()
    @IsString()
    phone?: string

    @IsOptional()
    @IsString()
    website?: string

    @IsOptional()
    @IsString()
    billingAddress?: string

    @IsOptional()
    @IsString()
    shippingAddress?: string

    @IsOptional()
    @IsString()
    country?: string

    @IsOptional()
    @IsString()
    region?: string

    @ValidateIf(ifPresent)
    @IsString()
    currencyId?: string

    @ValidateIf(ifPresent)
    @IsString()
    paymentTermsId?: string

    @IsOptional()
    @IsString()
    deliveryTerms?: string

    @ValidateIf(ifPresent)
    @IsString()
    defaultWarehouseId?: string

    @ValidateIf(ifPresent)
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsString()
    taxCode?: string

    @IsOptional()
    @IsString()
    taxStatus?: string

    @ValidateIf(ifPresent)
    @IsString()
    categoryId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}
