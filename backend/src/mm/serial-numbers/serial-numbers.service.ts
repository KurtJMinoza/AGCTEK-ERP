import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class SerialNumbersService {
    constructor(private prisma: PrismaService) {}

    async findAll(materialId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        return this.prisma.mmSerialNumber.findMany({
            where,
            include: {
                material: { select: { id: true, materialCode: true, materialName: true, serialManaged: true } },
                batch: { select: { id: true, batchNumber: true } },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const sn = await this.prisma.mmSerialNumber.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: true,
                batch: true,
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
        if (!sn) throw new NotFoundException('Serial number not found')
        return sn
    }

    async create(data: {
        materialId: string
        serialNumber: string
        batchId?: string
        currentWarehouseId?: string
        currentBinId?: string
        status?: string
    }) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: data.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')
        if (!material.serialManaged) {
            throw new BadRequestException('Material is not serial-managed')
        }

        const exists = await this.prisma.mmSerialNumber.findFirst({
            where: { materialId: data.materialId, serialNumber: data.serialNumber, deletedAt: null },
        })
        if (exists) throw new ConflictException('Serial number already exists for this material')

        if (data.batchId) {
            const batch = await this.prisma.mmBatch.findFirst({
                where: { id: data.batchId, materialId: data.materialId, deletedAt: null },
            })
            if (!batch) throw new BadRequestException('Batch not found for this material')
        }

        return this.prisma.mmSerialNumber.create({
            data: {
                materialId: data.materialId,
                serialNumber: data.serialNumber,
                batchId: data.batchId || null,
                currentWarehouseId: data.currentWarehouseId || null,
                currentBinId: data.currentBinId || null,
                status: data.status || 'AVAILABLE',
            },
            include: {
                batch: { select: { id: true, batchNumber: true } },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
    }

    async update(id: string, data: Partial<{
        serialNumber: string
        batchId: string | null
        currentWarehouseId: string | null
        currentBinId: string | null
        status: string
    }>) {
        const sn = await this.findOne(id)
        if (data.serialNumber && data.serialNumber !== sn.serialNumber) {
            const exists = await this.prisma.mmSerialNumber.findFirst({
                where: {
                    materialId: sn.materialId,
                    serialNumber: data.serialNumber,
                    deletedAt: null,
                    id: { not: id },
                },
            })
            if (exists) throw new ConflictException('Serial number already exists for this material')
        }
        return this.prisma.mmSerialNumber.update({
            where: { id },
            data: data as any,
            include: {
                batch: { select: { id: true, batchNumber: true } },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmSerialNumber.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
