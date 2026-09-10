import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSupplierMaterialDto } from './dto/create-supplier-material.dto'
import { Decimal } from '@prisma/client/runtime/library'

const INCLUDES = {
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    material: { select: { id: true, materialCode: true, materialName: true } },
    currency: true,
}

@Injectable()
export class SupplierMaterialService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateSupplierMaterialDto) {
        const existing = await this.prisma.mmSupplierMaterial.findUnique({
            where: { supplierId_materialId: { supplierId: dto.supplierId, materialId: dto.materialId } },
        })
        if (existing) {
            throw new ConflictException('Supplier-material combination already exists')
        }

        return this.prisma.mmSupplierMaterial.create({
            data: {
                supplierId: dto.supplierId,
                materialId: dto.materialId,
                supplierMaterialCode: dto.supplierMaterialCode ?? null,
                unitPrice: new Decimal(dto.unitPrice),
                currencyId: dto.currencyId ?? null,
                minimumOrderQuantity: dto.minimumOrderQuantity != null ? new Decimal(dto.minimumOrderQuantity) : null,
                leadTimeDays: dto.leadTimeDays ?? null,
                validityStart: dto.validityStart ? new Date(dto.validityStart) : null,
                validityEnd: dto.validityEnd ? new Date(dto.validityEnd) : null,
                preferredSupplier: dto.preferredSupplier ?? false,
            },
            include: INCLUDES,
        })
    }

    async update(id: string, dto: Partial<CreateSupplierMaterialDto>) {
        const existing = await this.prisma.mmSupplierMaterial.findUnique({ where: { id } })
        if (!existing) throw new NotFoundException('Supplier-material record not found')

        const data: any = {}
        if (dto.supplierMaterialCode !== undefined) data.supplierMaterialCode = dto.supplierMaterialCode
        if (dto.unitPrice !== undefined) data.unitPrice = new Decimal(dto.unitPrice)
        if (dto.currencyId !== undefined) data.currencyId = dto.currencyId
        if (dto.minimumOrderQuantity !== undefined) data.minimumOrderQuantity = dto.minimumOrderQuantity != null ? new Decimal(dto.minimumOrderQuantity) : null
        if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays
        if (dto.validityStart !== undefined) data.validityStart = dto.validityStart ? new Date(dto.validityStart) : null
        if (dto.validityEnd !== undefined) data.validityEnd = dto.validityEnd ? new Date(dto.validityEnd) : null
        if (dto.preferredSupplier !== undefined) data.preferredSupplier = dto.preferredSupplier

        return this.prisma.mmSupplierMaterial.update({
            where: { id },
            data,
            include: INCLUDES,
        })
    }

    async findAll(query: { supplierId?: string; materialId?: string; page?: number; pageSize?: number }) {
        const where: any = {}
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.materialId) where.materialId = query.materialId

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierMaterial.findMany({
                where,
                include: INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmSupplierMaterial.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const record = await this.prisma.mmSupplierMaterial.findUnique({
            where: { id },
            include: INCLUDES,
        })
        if (!record) throw new NotFoundException('Supplier-material record not found')
        return record
    }

    async deactivate(id: string) {
        const record = await this.prisma.mmSupplierMaterial.findUnique({ where: { id } })
        if (!record) throw new NotFoundException('Supplier-material record not found')

        return this.prisma.mmSupplierMaterial.update({
            where: { id },
            data: { status: 'INACTIVE' },
            include: INCLUDES,
        })
    }

    async delete(id: string) {
        const record = await this.prisma.mmSupplierMaterial.findUnique({ where: { id } })
        if (!record) throw new NotFoundException('Supplier-material record not found')
        return this.prisma.mmSupplierMaterial.delete({ where: { id } })
    }
}
