import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
    CanPostToPeriodInput,
    CanPostToPeriodResult,
} from '../mm/integration/fico/financial-period.port'

@Injectable()
export class FicoFinancialPeriodService {
    constructor(private prisma: PrismaService) {}

    async canPostToPeriod(
        input: CanPostToPeriodInput,
    ): Promise<CanPostToPeriodResult> {
        const postingDate =
            typeof input.postingDate === 'string'
                ? new Date(input.postingDate)
                : input.postingDate

        const period = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: input.companyId,
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
        })

        if (!period) {
            return {
                allowed: true,
                periodKey: undefined,
                reason: undefined,
            }
        }

        const periodKey = `${period.fiscalYear}-${String(period.periodNumber).padStart(2, '0')}`
        if (period.status === 'CLOSED') {
            return {
                allowed: false,
                periodKey,
                reason: `Financial period ${periodKey} is closed for company ${input.companyId}`,
            }
        }

        return { allowed: true, periodKey }
    }

    async listPeriods(companyId: string) {
        return this.prisma.ficoFinancialPeriod.findMany({
            where: { companyId },
            orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
        })
    }

    async upsertPeriod(input: {
        companyId: string
        fiscalYear: number
        periodNumber: number
        startDate: Date
        endDate: Date
        status?: string
    }) {
        return this.prisma.ficoFinancialPeriod.upsert({
            where: {
                companyId_fiscalYear_periodNumber: {
                    companyId: input.companyId,
                    fiscalYear: input.fiscalYear,
                    periodNumber: input.periodNumber,
                },
            },
            create: {
                companyId: input.companyId,
                fiscalYear: input.fiscalYear,
                periodNumber: input.periodNumber,
                startDate: input.startDate,
                endDate: input.endDate,
                status: input.status ?? 'OPEN',
            },
            update: {
                startDate: input.startDate,
                endDate: input.endDate,
                status: input.status,
            },
        })
    }

    async setPeriodStatus(
        companyId: string,
        fiscalYear: number,
        periodNumber: number,
        status: 'OPEN' | 'CLOSED',
    ) {
        return this.prisma.ficoFinancialPeriod.update({
            where: {
                companyId_fiscalYear_periodNumber: {
                    companyId,
                    fiscalYear,
                    periodNumber,
                },
            },
            data: { status },
        })
    }
}
