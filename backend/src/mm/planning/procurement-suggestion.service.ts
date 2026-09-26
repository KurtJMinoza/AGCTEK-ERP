import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PurchaseRequisitionService } from '../purchase-requisition/purchase-requisition.service'
import { ConvertSuggestionDto, SuggestionQueryDto } from './dto/planning.dto'

const SUGGESTION_INCLUDE = {
    material: {
        select: {
            id: true,
            materialCode: true,
            materialName: true,
            baseUomId: true,
        },
    },
    warehouse: { select: { id: true, code: true, name: true } },
    preferredSupplier: {
        select: { id: true, supplierCode: true, supplierName: true },
    },
    mrpRun: { select: { id: true, runNumber: true, status: true } },
    materialRequirement: true,
    purchaseRequisition: {
        select: { id: true, requisitionNumber: true, status: true },
    },
}

@Injectable()
export class ProcurementSuggestionService {
    constructor(
        private prisma: PrismaService,
        private purchaseRequisitions: PurchaseRequisitionService,
    ) {}

    async findAll(query: SuggestionQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.mrpRunId) where.mrpRunId = query.mrpRunId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        if (query.suggestionType) where.suggestionType = query.suggestionType

        const [data, total] = await Promise.all([
            this.prisma.mmProcurementSuggestion.findMany({
                where,
                include: SUGGESTION_INCLUDE,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmProcurementSuggestion.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmProcurementSuggestion.findUnique({
            where: { id },
            include: SUGGESTION_INCLUDE,
        })
        if (!row) throw new NotFoundException('Procurement suggestion not found')
        return row
    }

    async dismiss(id: string) {
        const row = await this.findOne(id)
        if (row.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN suggestions can be dismissed')
        }
        return this.prisma.mmProcurementSuggestion.update({
            where: { id },
            data: { status: 'DISMISSED' },
            include: SUGGESTION_INCLUDE,
        })
    }

    async convertToPr(id: string, dto: ConvertSuggestionDto) {
        const suggestion = await this.findOne(id)
        if (suggestion.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN suggestions can be converted')
        }
        if (suggestion.suggestionType === 'PLANNED_REPLENISHMENT') {
            // Still allow PR if user wants; planned replenishment may be internal.
            // Convert always creates DRAFT PR per plan action.
        }

        const qty = Number(suggestion.quantity)
        const pr = await this.purchaseRequisitions.create({
            companyId: suggestion.companyId,
            requesterId: dto.requesterId,
            requiredDate: suggestion.requiredDate.toISOString(),
            purpose:
                dto.purpose ??
                `MRP suggestion ${suggestion.id} from run ${suggestion.mrpRun.runNumber}`,
            createdBy: dto.createdBy,
            sourceMrpRunId: suggestion.mrpRunId,
            lines: [
                {
                    materialId: suggestion.materialId,
                    requestedQuantity: qty,
                    uomId: suggestion.uomId,
                    estimatedUnitPrice: dto.estimatedUnitPrice ?? 0,
                    requiredDate: suggestion.requiredDate.toISOString(),
                    warehouseId: suggestion.warehouseId,
                    preferredSupplierId:
                        suggestion.preferredSupplierId ?? undefined,
                    remarks: `Converted from procurement suggestion ${suggestion.id}`,
                },
            ],
        })

        const updated = await this.prisma.mmProcurementSuggestion.update({
            where: { id },
            data: {
                status: 'CONVERTED',
                purchaseRequisitionId: pr.id,
            },
            include: SUGGESTION_INCLUDE,
        })

        if (suggestion.plannedOrderId) {
            await this.prisma.mmPlannedOrder.update({
                where: { id: suggestion.plannedOrderId },
                data: {
                    status: 'CONVERTED',
                    purchaseRequisitionId: pr.id,
                },
            })
        }

        return { suggestion: updated, purchaseRequisition: pr }
    }
}
