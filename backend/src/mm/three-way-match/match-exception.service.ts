import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    MatchExceptionQueryDto,
    ResolveExceptionDto,
} from './dto/three-way-match.dto'

@Injectable()
export class MatchExceptionService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: MatchExceptionQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.invoiceId) where.invoiceId = query.invoiceId
        if (query.status) where.status = query.status
        if (query.varianceType) where.varianceType = query.varianceType
        if (query.companyId) {
            where.invoice = { companyId: query.companyId }
        }

        const [data, total] = await Promise.all([
            this.prisma.mmMatchException.findMany({
                where,
                include: {
                    invoice: {
                        include: { supplier: true, purchaseOrder: true },
                    },
                    invoiceLine: { include: { material: true } },
                    purchaseOrder: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmMatchException.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmMatchException.findUnique({
            where: { id },
            include: {
                invoice: true,
                invoiceLine: true,
                purchaseOrder: true,
            },
        })
        if (!row) throw new NotFoundException('Match exception not found')
        return row
    }

    async acknowledge(id: string) {
        const row = await this.findOne(id)
        if (row.status !== 'OPEN') {
            throw new BadRequestException('Only OPEN exceptions can be acknowledged')
        }
        return this.prisma.mmMatchException.update({
            where: { id },
            data: { status: 'ACKNOWLEDGED' },
        })
    }

    async resolve(id: string, dto: ResolveExceptionDto = {}) {
        const row = await this.findOne(id)
        if (!['OPEN', 'ACKNOWLEDGED'].includes(row.status)) {
            throw new BadRequestException('Exception is not open')
        }
        return this.prisma.mmMatchException.update({
            where: { id },
            data: {
                status: 'RESOLVED',
                resolvedBy: dto.resolvedBy ?? null,
                resolvedAt: new Date(),
                paymentBlocked: false,
            },
        })
    }

    async waive(id: string, dto: ResolveExceptionDto = {}) {
        const row = await this.findOne(id)
        if (!['OPEN', 'ACKNOWLEDGED'].includes(row.status)) {
            throw new BadRequestException('Exception is not open')
        }
        return this.prisma.mmMatchException.update({
            where: { id },
            data: {
                status: 'WAIVED',
                resolvedBy: dto.resolvedBy ?? null,
                resolvedAt: new Date(),
                paymentBlocked: false,
            },
        })
    }
}
