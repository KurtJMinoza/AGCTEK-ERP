import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
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
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: data.materialId, deletedAt: null },
        })
        if (!material?.companyId) {
            throw new BadRequestException('Material must belong to a company')
        }
        const exists = await this.prisma.mmBarcode.findFirst({
            where: {
                companyId: material.companyId,
                barcodeValue: data.barcodeValue,
                deletedAt: null,
                archivedAt: null,
                status: 'ACTIVE',
            },
        })
        if (exists) throw new ConflictException('Barcode value already exists for this company')

        const isPrimary = Boolean(data.isPrimary)
        if (isPrimary) {
            await this.prisma.mmBarcode.updateMany({
                where: { materialId: data.materialId, deletedAt: null, isPrimary: true, status: 'ACTIVE' },
                data: { isPrimary: false },
            })
        }

        return this.prisma.mmBarcode.create({
            data: {
                companyId: material.companyId,
                materialId: data.materialId,
                entityType: 'MATERIAL',
                entityId: data.materialId,
                barcodeType: data.barcodeType,
                barcodeValue: data.barcodeValue,
                isPrimary,
                status: 'ACTIVE',
            },
            include: { material: { select: { id: true, materialCode: true, materialName: true } } },
        })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmBarcode.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
