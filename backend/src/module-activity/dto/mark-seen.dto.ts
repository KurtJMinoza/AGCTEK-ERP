import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator'

export class MarkModuleSeenDto {
    /** Module keys (`module:sd`) and page paths the user just opened. */
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(200, { each: true })
    keys!: string[]
}
