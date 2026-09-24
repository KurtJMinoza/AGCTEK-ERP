import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateNonconformanceDto, QualityQueryDto, ResolveNonconformanceDto,
} from './dto/quality.dto'

@Injectable()
export class NonconformanceService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: QualityQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.status) where.status = query.status
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmNonconformance.findMany({
                where,
                include: {
                    inspectionLot: { select: { id: true, lotNumber: true } },
                    inspectionDefect: true,
                    correctiveActions: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmNonconformance.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const nc = await this.prisma.mmNonconformance.findUnique({
            where: { id },
            include: {
                inspectionLot: true,
                inspectionDefect: true,
                correctiveActions: true,
            },
        })
        if (!nc) throw new NotFoundException('Nonconformance not found')
        return nc
    }

    async create(dto: CreateNonconformanceDto) {
        const ncNumber = await this.nextNumber()
        return this.prisma.mmNonconformance.create({
            data: {
                ncNumber,
                companyId: dto.companyId,
                inspectionLotId: dto.inspectionLotId ?? null,
                inspectionDefectId: dto.inspectionDefectId ?? null,
                cause: dto.cause ?? null,
                severity: dto.severity ?? null,
                affectedQuantity: new Decimal(dto.affectedQuantity ?? 0),
                responsibleParty: dto.responsibleParty ?? null,
                notes: dto.notes ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'OPEN',
            },
        })
    }

    async createFromDefect(defectId: string, createdBy?: string) {
        const defect = await this.prisma.mmInspectionDefect.findUnique({
            where: { id: defectId },
            include: { inspectionLot: true },
        })
        if (!defect) throw new NotFoundException('Defect not found')
        return this.create({
            companyId: defect.inspectionLot.companyId,
            inspectionLotId: defect.inspectionLotId,
            inspectionDefectId: defectId,
            cause: defect.defectCode,
            severity: defect.severity ?? undefined,
            affectedQuantity: Number(defect.quantity),
            createdBy,
        })
    }

    async resolve(id: string, dto: ResolveNonconformanceDto) {
        const nc = await this.findOne(id)
        if (['CLOSED', 'RESOLVED'].includes(nc.status)) {
            throw new BadRequestException(`NC already ${nc.status}`)
        }
        return this.prisma.mmNonconformance.update({
            where: { id },
            data: {
                status: dto.status ?? 'RESOLVED',
                resolvedBy: dto.resolvedBy ?? null,
                resolvedAt: new Date(),
                notes: dto.notes ?? nc.notes,
            },
        })
    }

    private async nextNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `NC-${today}-`
        const count = await this.prisma.mmNonconformance.count({
            where: { ncNumber: { startsWith: pfx } },
        })
        return `${pfx}${String(count + 1).padStart(5, '0')}`
    }
}
