import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { QualityQueryDto } from './dto/quality.dto'

@Injectable()
export class QualityReportingService {
    constructor(private prisma: PrismaService) {}

    async getDashboard(query: QualityQueryDto) {
        const companyId = query.companyId
        const lotWhere: any = companyId ? { companyId } : {}

        const [
            totalLots,
            pendingLots,
            inProgressLots,
            pendingDecision,
            activeHolds,
            openNc,
            decisions,
            defects,
        ] = await Promise.all([
            this.prisma.mmInspectionLot.count({ where: lotWhere }),
            this.prisma.mmInspectionLot.count({
                where: { ...lotWhere, status: { in: ['CREATED', 'READY', 'PENDING'] } },
            }),
            this.prisma.mmInspectionLot.count({
                where: { ...lotWhere, status: 'IN_PROGRESS' },
            }),
            this.prisma.mmInspectionLot.count({
                where: { ...lotWhere, status: 'PENDING_DECISION' },
            }),
            this.prisma.mmQualityHold.count({
                where: { ...(companyId ? { companyId } : {}), status: 'ACTIVE' },
            }),
            this.prisma.mmNonconformance.count({
                where: { ...(companyId ? { companyId } : {}), status: { notIn: ['CLOSED', 'RESOLVED'] } },
            }),
            this.prisma.mmQualityDecision.findMany({
                where: companyId
                    ? { inspectionLot: { companyId } }
                    : {},
                select: { decisionCode: true, quantity: true, decidedAt: true },
                take: 500,
                orderBy: { decidedAt: 'desc' },
            }),
            this.prisma.mmInspectionDefect.groupBy({
                by: ['defectCode'],
                where: companyId
                    ? { inspectionLot: { companyId } }
                    : {},
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 10,
            }),
        ])

        const acceptCount = decisions.filter((d) =>
            ['ACCEPT', 'ACCEPT_WITH_DEVIATION'].includes(d.decisionCode),
        ).length
        const rejectCount = decisions.filter((d) =>
            ['BLOCK', 'REJECT', 'RETURN'].includes(d.decisionCode),
        ).length
        const totalDecisions = decisions.length || 1

        return {
            totalLots,
            pendingLots,
            inProgressLots,
            pendingDecision,
            activeHolds,
            openNonconformances: openNc,
            acceptanceRate: Math.round((acceptCount / totalDecisions) * 1000) / 10,
            rejectionRate: Math.round((rejectCount / totalDecisions) * 1000) / 10,
            returnRate: Math.round(
                (decisions.filter((d) => d.decisionCode === 'RETURN').length / totalDecisions) * 1000,
            ) / 10,
            topDefects: defects.map((d) => ({ code: d.defectCode, count: d._count.id })),
            readOnly: true,
        }
    }

    async listDecisions(query: QualityQueryDto) {
        const companyId = query.companyId
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: any = companyId ? { inspectionLot: { companyId } } : {}
        if (query.search) {
            where.OR = [
                { decisionCode: { contains: query.search, mode: 'insensitive' } },
                { inspectionLot: { lotNumber: { contains: query.search, mode: 'insensitive' } } },
            ]
        }
        const [data, total] = await Promise.all([
            this.prisma.mmQualityDecision.findMany({
                where,
                include: {
                    inspectionLot: {
                        select: {
                            id: true,
                            lotNumber: true,
                            material: { select: { materialCode: true, materialName: true } },
                        },
                    },
                },
                orderBy: { decidedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmQualityDecision.count({ where }),
        ])
        return { data, total, page, pageSize }
    }
}
