import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class BarcodesService {
    constructor(private prisma: PrismaService) {}

    async findAll(materialId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        return this.prisma.mmBarcode.findMany({
            where,
            include: { material: { select: { id: true, materialCode: true, materialName: true } } },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const barcode = await this.prisma.mmBarcode.findFirst({ where: { id, deletedAt: null } })
        if (!barcode) throw new NotFoundException('Barcode not found')
        return barcode
    }

    async create(data: { materialId: string; barcodeType: string; barcodeValue: string; isPrimary?: boolean }) {
        const exists = await this.prisma.mmBarcode.findFirst({
            where: { barcodeValue: data.barcodeValue, deletedAt: null },
        })
        if (exists) throw new ConflictException('Barcode value already exists')

        const isPrimary = Boolean(data.isPrimary)
        if (isPrimary) {
            await this.prisma.mmBarcode.updateMany({
                where: { materialId: data.materialId, deletedAt: null, isPrimary: true },
                data: { isPrimary: false },
            })
        }

        return this.prisma.mmBarcode.create({
            data: {
                materialId: data.materialId,
                barcodeType: data.barcodeType,
                barcodeValue: data.barcodeValue,
                isPrimary,
            },
            include: { material: { select: { id: true, materialCode: true, materialName: true } } },
        })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmBarcode.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
