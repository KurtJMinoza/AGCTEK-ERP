import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateManualAssessmentDto,
    ManualAssessmentQueryDto,
} from './dto/supplier-performance.dto'

@Injectable()
export class SupplierManualAssessmentService {
    constructor(private prisma: PrismaService) {}

    /**
     * Manual assessments are a separate controlled record.
     * They never update MmSupplierEvaluation computed scores.
     */
    async create(dto: CreateManualAssessmentDto) {
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: {
                id: dto.supplierId,
                companyId: dto.companyId,
                deletedAt: null,
            },
        })
        if (!supplier) throw new NotFoundException('Supplier not found')

        return this.prisma.mmSupplierManualAssessment.create({
            data: {
                companyId: dto.companyId,
                supplierId: dto.supplierId,
                assessmentDate: dto.assessmentDate
                    ? new Date(dto.assessmentDate)
                    : new Date(),
                periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
                periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
                deliveryScore:
                    dto.deliveryScore != null
                        ? new Decimal(dto.deliveryScore)
                        : null,
                qualityScore:
                    dto.qualityScore != null
                        ? new Decimal(dto.qualityScore)
                        : null,
                priceScore:
                    dto.priceScore != null ? new Decimal(dto.priceScore) : null,
                serviceScore:
                    dto.serviceScore != null
                        ? new Decimal(dto.serviceScore)
                        : null,
                complianceScore:
                    dto.complianceScore != null
                        ? new Decimal(dto.complianceScore)
                        : null,
                overallScore: new Decimal(dto.overallScore),
                notes: dto.notes ?? null,
                assessedBy: dto.assessedBy,
                status: dto.status ?? 'DRAFT',
            },
            include: {
                supplier: {
                    select: {
                        id: true,
                        supplierCode: true,
                        supplierName: true,
                    },
                },
            },
        })
    }

    async findAll(query: ManualAssessmentQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.status) where.status = query.status

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierManualAssessment.findMany({
                where,
                include: {
                    supplier: {
                        select: {
                            id: true,
                            supplierCode: true,
                            supplierName: true,
                        },
                    },
                },
                orderBy: { assessmentDate: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmSupplierManualAssessment.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async submit(id: string) {
        const row = await this.prisma.mmSupplierManualAssessment.findUnique({
            where: { id },
        })
        if (!row) throw new NotFoundException('Manual assessment not found')
        if (row.status !== 'DRAFT') {
            throw new BadRequestException('Only DRAFT assessments can be submitted')
        }
        return this.prisma.mmSupplierManualAssessment.update({
            where: { id },
            data: { status: 'SUBMITTED' },
        })
    }

    async approve(id: string) {
        const row = await this.prisma.mmSupplierManualAssessment.findUnique({
            where: { id },
        })
        if (!row) throw new NotFoundException('Manual assessment not found')
        if (!['DRAFT', 'SUBMITTED'].includes(row.status)) {
            throw new BadRequestException(
                'Only DRAFT/SUBMITTED assessments can be approved',
            )
        }
        return this.prisma.mmSupplierManualAssessment.update({
            where: { id },
            data: { status: 'APPROVED' },
        })
    }

    async cancel(id: string) {
        const row = await this.prisma.mmSupplierManualAssessment.findUnique({
            where: { id },
        })
        if (!row) throw new NotFoundException('Manual assessment not found')
        if (row.status === 'CANCELLED') return row
        return this.prisma.mmSupplierManualAssessment.update({
            where: { id },
            data: { status: 'CANCELLED' },
        })
    }
}
