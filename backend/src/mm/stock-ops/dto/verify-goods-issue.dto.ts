import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** Warehouse supervisor sign-off before GI posting (ISO 9001 step 3). */
export class VerifyGoodsIssueSupervisorDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    verifiedBy!: string

    /** Sales order, delivery order, production order, or package order reference confirmed on the dock. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    sourceDocumentReference!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    verificationNotes?: string
}
