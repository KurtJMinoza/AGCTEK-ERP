import {
    IsString,
    IsOptional,
    IsEmail,
    IsInt,
    Min,
} from 'class-validator'

export class UpdateSupplierDto {
    @IsOptional()
    @IsString()
    supplierName?: string

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

    @IsOptional()
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

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    paymentTermsId?: string

    @IsOptional()
    @IsString()
    deliveryTerms?: string

    @IsOptional()
    @IsString()
    defaultWarehouseId?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsString()
    taxCode?: string

    @IsOptional()
    @IsString()
    taxStatus?: string

    @IsOptional()
    @IsString()
    categoryId?: string
}
