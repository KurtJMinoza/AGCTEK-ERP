import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { AlertQueryDto } from './dto/supplier-performance.dto'

/**
 * Alerts only — never blocks or deactivates a supplier.
 */
@Injectable()
export class SupplierAlertService {
    constructor(private prisma: PrismaService) {}

    async createIfNeeded(input: {
        companyId: string
        supplierId: string
        evaluationId: string
        score: number
        threshold: number
        supplierCode: string
    }) {
        const existing = await this.prisma.mmSupplierAlert.findFirst({
            where: {
                evaluationId: input.evaluationId,
                status: 'OPEN',
            },
        })
        if (existing) return existing

        return this.prisma.mmSupplierAlert.create({
            data: {
                companyId: input.companyId,
                supplierId: input.supplierId,
                evaluationId: input.evaluationId,
                score: new Decimal(input.score),
                threshold: new Decimal(input.threshold),
                status: 'OPEN',
                message: `Supplier ${input.supplierCode} score ${input.score.toFixed(1)} fell below threshold ${input.threshold}`,
            },
        })
    }

    async findAll(query: AlertQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.status) where.status = query.status

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierAlert.findMany({
                where,
                include: {
                    supplier: {
                        select: {
                            id: true,
                            supplierCode: true,
                            supplierName: true,
                            status: true,
                        },
                    },
                    evaluation: {
                        select: {
                            id: true,
                            periodStart: true,
                            periodEnd: true,
                            overallScore: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmSupplierAlert.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async acknowledge(id: string) {
        const row = await this.prisma.mmSupplierAlert.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Alert not found')
        if (row.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN alerts can be acknowledged')
        }
        return this.prisma.mmSupplierAlert.update({
            where: { id },
            data: { status: 'ACKNOWLEDGED' },
        })
    }

    async dismiss(id: string) {
        const row = await this.prisma.mmSupplierAlert.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Alert not found')
        if (row.status === 'DISMISSED') {
            throw new BadRequestException('Alert already dismissed')
        }
        return this.prisma.mmSupplierAlert.update({
            where: { id },
            data: { status: 'DISMISSED' },
        })
    }
}
