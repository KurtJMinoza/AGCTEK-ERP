import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TraceabilityQueryDto } from './dto/traceability-query.dto'

@Injectable()
export class InventoryTraceabilityService {
    constructor(private prisma: PrismaService) {}

    private readonly includes = {
        company: true,
        warehouse: true,
        storageBin: true,
        sourceBin: true,
        destinationBin: true,
        material: true,
        batch: true,
        serialNumber: true,
        uom: true,
        reversalOf: true,
        reversedBy: true,
        audit: { orderBy: { performedAt: 'asc' as const } },
    }

    async trace(query: TraceabilityQueryDto) {
        if (
            !query.materialId &&
            !query.batchId &&
            !query.serialNumberId &&
            !query.sourceDocumentId &&
            !query.transactionId
        ) {
            throw new BadRequestException(
                'Provide at least one of materialId, batchId, serialNumberId, sourceDocumentId, or transactionId',
            )
        }

        const page = query.page ?? 1
        const limit = Math.min(query.limit ?? 50, 200)
        const skip = (page - 1) * limit

        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.materialId) where.materialId = query.materialId
        if (query.batchId) where.batchId = query.batchId
        if (query.serialNumberId) where.serialNumberId = query.serialNumberId
        if (query.sourceDocumentId) where.sourceDocumentId = query.sourceDocumentId
        if (query.sourceDocumentType) where.sourceDocumentType = query.sourceDocumentType
        if (query.transactionId) where.id = query.transactionId

        const [transactions, total] = await Promise.all([
            this.prisma.mmInventoryTransaction.findMany({
                where,
                include: this.includes,
                orderBy: { postingDate: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.mmInventoryTransaction.count({ where }),
        ])

        return {
            data: transactions,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }
}
