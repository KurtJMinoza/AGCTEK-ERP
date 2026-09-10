import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreatePlanningDemandDto,
    UpdatePlanningDemandDto,
    PlanningDemandQueryDto,
} from './dto/planning.dto'

const DEMAND_INCLUDE = {
    material: {
        select: { id: true, materialCode: true, materialName: true },
    },
    warehouse: { select: { id: true, code: true, name: true } },
    company: { select: { id: true, name: true } },
}

@Injectable()
export class PlanningDemandService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: PlanningDemandQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.materialId) where.materialId = query.materialId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.sourceType) where.sourceType = query.sourceType
        if (query.fromDate || query.toDate) {
            where.demandDate = {}
            if (query.fromDate) where.demandDate.gte = new Date(query.fromDate)
            if (query.toDate) where.demandDate.lte = new Date(query.toDate)
        }

        const [data, total] = await Promise.all([
            this.prisma.mmPlanningDemand.findMany({
                where,
                include: DEMAND_INCLUDE,
                orderBy: [{ demandDate: 'asc' }, { createdAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmPlanningDemand.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmPlanningDemand.findUnique({
            where: { id },
            include: DEMAND_INCLUDE,
        })
        if (!row) throw new NotFoundException('Planning demand not found')
        return row
    }

    async create(dto: CreatePlanningDemandDto) {
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: dto.materialId },
        })
        if (!material) throw new BadRequestException('Material not found')

        return this.prisma.mmPlanningDemand.create({
            data: {
                companyId: dto.companyId,
                materialId: dto.materialId,
                warehouseId: dto.warehouseId ?? null,
                demandDate: new Date(dto.demandDate),
                quantity: new Decimal(dto.quantity),
                sourceType: dto.sourceType ?? 'MANUAL_INTERNAL',
                sourceDocumentId: dto.sourceDocumentId ?? null,
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
            },
            include: DEMAND_INCLUDE,
        })
    }

    async update(id: string, dto: UpdatePlanningDemandDto) {
        await this.findOne(id)
        const data: any = {}
        if (dto.warehouseId !== undefined) data.warehouseId = dto.warehouseId || null
        if (dto.demandDate !== undefined) data.demandDate = new Date(dto.demandDate)
        if (dto.quantity !== undefined) data.quantity = new Decimal(dto.quantity)
        if (dto.sourceType !== undefined) data.sourceType = dto.sourceType
        if (dto.sourceDocumentId !== undefined)
            data.sourceDocumentId = dto.sourceDocumentId
        if (dto.remarks !== undefined) data.remarks = dto.remarks

        return this.prisma.mmPlanningDemand.update({
            where: { id },
            data,
            include: DEMAND_INCLUDE,
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.mmPlanningDemand.delete({ where: { id } })
        return { deleted: true }
    }
}
