import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MmBarcodeSerialService } from './mm-barcode-serial.service'

@Module({
    providers: [PrismaService, MmBarcodeSerialService],
    exports: [MmBarcodeSerialService],
})
export class MmBarcodeSerialModule {}
