import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ExpiryControlService } from '../returns-disposal/expiry-control.service'

@Injectable()
export class BatchesService {
    constructor(
        private prisma: PrismaService,
        private expiryControl: ExpiryControlService,
    ) {}

    private withExpiryMeta<T extends {
        expiryDate?: Date | null
        shelfLifeDays?: number | null
        manufacturingDate?: Date | null
    }>(batch: T) {
        return {
            ...batch,
            ...this.expiryControl.computeExpiryInfo(batch),
        }
    }

    async findAll(materialId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        const rows = await this.prisma.mmBatch.findMany({
            where,
            include: {
                material: { select: { id: true, materialCode: true, materialName: true, batchManaged: true } },
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                serialNumbers: { where: { deletedAt: null } },
            },
            orderBy: { createdAt: 'desc' },
        })
        return rows.map((b) => this.withExpiryMeta(b))
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
        return this.withExpiryMeta(batch)
    }

    async create(data: {
        materialId: string
        batchNumber: string
        manufacturingDate?: string
        expiryDate?: string
        shelfLifeDays?: number
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

        const manufacturingDate = data.manufacturingDate
            ? new Date(data.manufacturingDate)
            : null
        const resolved = this.expiryControl.resolveExpiryDate({
            manufacturingDate,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            shelfLifeDays: data.shelfLifeDays ?? null,
            defaultShelfLifeDays: material.defaultShelfLifeDays ?? null,
        })

        const created = await this.prisma.mmBatch.create({
            data: {
                materialId: data.materialId,
                batchNumber: data.batchNumber,
                manufacturingDate: manufacturingDate ?? undefined,
                expiryDate: resolved.expiryDate ?? undefined,
                shelfLifeDays: resolved.shelfLifeDays ?? undefined,
                supplierId: data.supplierId || null,
                status: data.status || 'AVAILABLE',
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
            },
        })
        return this.withExpiryMeta(created)
    }

    async update(id: string, data: Partial<{
        batchNumber: string
        manufacturingDate: string | null
        expiryDate: string | null
        shelfLifeDays: number | null
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

        const manufacturingDate =
            data.manufacturingDate !== undefined
                ? data.manufacturingDate
                    ? new Date(data.manufacturingDate)
                    : null
                : batch.manufacturingDate
        const shelfLifeDays =
            data.shelfLifeDays !== undefined ? data.shelfLifeDays : batch.shelfLifeDays
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: batch.materialId },
            select: { defaultShelfLifeDays: true },
        })
        const resolved =
            data.expiryDate !== undefined ||
            data.manufacturingDate !== undefined ||
            data.shelfLifeDays !== undefined
                ? this.expiryControl.resolveExpiryDate({
                      manufacturingDate,
                      expiryDate:
                          data.expiryDate !== undefined
                              ? data.expiryDate
                                  ? new Date(data.expiryDate)
                                  : null
                              : batch.expiryDate,
                      shelfLifeDays,
                      defaultShelfLifeDays: material?.defaultShelfLifeDays ?? null,
                  })
                : null

        const updated = await this.prisma.mmBatch.update({
            where: { id },
            data: {
                ...(data.batchNumber !== undefined ? { batchNumber: data.batchNumber } : {}),
                ...(data.status !== undefined ? { status: data.status } : {}),
                ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
                ...(data.manufacturingDate !== undefined
                    ? { manufacturingDate: manufacturingDate }
                    : {}),
                ...(resolved
                    ? {
                          expiryDate: resolved.expiryDate,
                          shelfLifeDays: resolved.shelfLifeDays,
                      }
                    : {}),
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
            },
        })
        return this.withExpiryMeta(updated)
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmBatch.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
