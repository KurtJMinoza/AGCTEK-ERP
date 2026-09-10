import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class BatchesService {
    constructor(private prisma: PrismaService) {}

    async findAll(materialId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        return this.prisma.mmBatch.findMany({
            where,
            include: {
                material: { select: { id: true, materialCode: true, materialName: true, batchManaged: true } },
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                serialNumbers: { where: { deletedAt: null } },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const batch = await this.prisma.mmBatch.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: true,
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                serialNumbers: { where: { deletedAt: null } },
            },
        })
        if (!batch) throw new NotFoundException('Batch not found')
        return batch
    }

    async create(data: {
        materialId: string
        batchNumber: string
        manufacturingDate?: string
        expiryDate?: string
        supplierId?: string
        status?: string
    }) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: data.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')
        if (!material.batchManaged) {
            throw new BadRequestException('Material is not batch-managed')
        }

        const exists = await this.prisma.mmBatch.findFirst({
            where: { materialId: data.materialId, batchNumber: data.batchNumber, deletedAt: null },
        })
        if (exists) throw new ConflictException('Batch number already exists for this material')

        return this.prisma.mmBatch.create({
            data: {
                materialId: data.materialId,
                batchNumber: data.batchNumber,
                manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : undefined,
                expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
                supplierId: data.supplierId || null,
                status: data.status || 'AVAILABLE',
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
            },
        })
    }

    async update(id: string, data: Partial<{
        batchNumber: string
        manufacturingDate: string | null
        expiryDate: string | null
        supplierId: string | null
        status: string
    }>) {
        const batch = await this.findOne(id)
        if (data.batchNumber && data.batchNumber !== batch.batchNumber) {
            const exists = await this.prisma.mmBatch.findFirst({
                where: {
                    materialId: batch.materialId,
                    batchNumber: data.batchNumber,
                    deletedAt: null,
                    id: { not: id },
                },
            })
            if (exists) throw new ConflictException('Batch number already exists for this material')
        }
        return this.prisma.mmBatch.update({
            where: { id },
            data: {
                ...(data.batchNumber !== undefined ? { batchNumber: data.batchNumber } : {}),
                ...(data.status !== undefined ? { status: data.status } : {}),
                ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
                ...(data.manufacturingDate !== undefined
                    ? { manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : null }
                    : {}),
                ...(data.expiryDate !== undefined
                    ? { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null }
                    : {}),
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
            },
        })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmBatch.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
