import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator'

export class ReceiveTransferLineDto {
    @IsString()
    @IsNotEmpty()
    lineId!: string

    @IsNumber()
    @Min(0.01)
    receivedQty!: number
}
