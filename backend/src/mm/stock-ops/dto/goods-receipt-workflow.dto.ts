import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class SubmitGoodsReceiptDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    submittedBy!: string
}

export class VerifyGoodsReceiptDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    verifiedBy!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    verificationNotes?: string
}
