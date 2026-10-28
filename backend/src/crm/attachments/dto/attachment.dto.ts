import { Transform } from 'class-transformer'
import { IsBase64, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/** JSON upload (base64 body, 10 MB file cap; same contract as MM quality attachments). */
export class UploadCrmAttachmentDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    fileName!: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    mimeType?: string

    @IsString()
    @IsNotEmpty()
    @IsBase64()
    contentBase64!: string
}
