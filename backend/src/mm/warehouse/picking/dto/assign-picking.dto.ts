import { IsString, IsNotEmpty } from 'class-validator'

export class AssignPickingDto {
    @IsString()
    @IsNotEmpty()
    userId!: string
}
