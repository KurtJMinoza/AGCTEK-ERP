import { Transform, Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

export class AddNoteDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    body!: string
}

export class EditNoteDto extends AddNoteDto {}

export class ListFeedQueryDto {
    /** ISO instant of the last returned item; the next page returns strictly older items. */
    @IsOptional()
    @IsString()
    cursor?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number
}