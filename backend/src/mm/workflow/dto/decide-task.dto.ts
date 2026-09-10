import { IsIn, IsOptional, IsString, IsNotEmpty } from 'class-validator'

export class DecideTaskDto {
    @IsIn(['APPROVE', 'REJECT', 'RETURN'])
    @IsNotEmpty()
    decision!: 'APPROVE' | 'REJECT' | 'RETURN'

    @IsOptional()
    @IsString()
    comment?: string

    @IsOptional()
    @IsString()
    userId?: string
}