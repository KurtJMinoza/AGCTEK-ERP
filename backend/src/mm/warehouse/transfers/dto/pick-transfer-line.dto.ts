import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator'

export class PickTransferLineDto {
    @IsString()
    @IsNotEmpty()
    lineId!: string

    @IsNumber()
    @Min(0.01)
    pickedQty!: number
}
