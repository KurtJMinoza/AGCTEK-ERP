import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

export type UpsertCountConfigDto = {
    blindCountingEnabled?: boolean
    separationOfDutiesEnabled?: boolean
    recountOnEveryDiscrepancy?: boolean
    recountOnToleranceExceeded?: boolean
    absoluteQtyTolerance?: number
    percentTolerance?: number
    financialValueTolerance?: number
    maxRecounts?: number
    differentRecountWorkerRequired?: boolean
    movementControlPolicy?: 'HARD' | 'SOFT' | 'NONE'
    adjustmentApprovalValueThreshold?: number
    financeApprovalValueThreshold?: number
    requireVarianceEvidence?: boolean
    requireRootCauseAnalysis?: boolean
    allowZeroCountConfirmation?: boolean
    mobileBarcodeScanningAllowed?: boolean
    requireBatchLevelCounting?: boolean
    requireSerialLevelCounting?: boolean
}

@Injectable()
export class CountConfigurationService {
    constructor(private prisma: PrismaService) {}

    async getForCompany(companyId: string) {
        const row = await this.prisma.mmCountCompanyConfig.findUnique({
            where: { companyId },
        })
        if (row) return row
        return this.prisma.mmCountCompanyConfig.create({
            data: { companyId },
        })
    }

    async upsert(companyId: string, dto: UpsertCountConfigDto) {
        await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } })
        const data: Record<string, unknown> = { ...dto }
        if (dto.absoluteQtyTolerance != null) {
            data.absoluteQtyTolerance = new Decimal(dto.absoluteQtyTolerance)
        }
        if (dto.percentTolerance != null) {
            data.percentTolerance = new Decimal(dto.percentTolerance)
        }
        if (dto.financialValueTolerance != null) {
            data.financialValueTolerance = new Decimal(dto.financialValueTolerance)
        }
        if (dto.adjustmentApprovalValueThreshold != null) {
            data.adjustmentApprovalValueThreshold = new Decimal(
                dto.adjustmentApprovalValueThreshold,
            )
        }
        if (dto.financeApprovalValueThreshold != null) {
            data.financeApprovalValueThreshold = new Decimal(
                dto.financeApprovalValueThreshold,
            )
        }
        return this.prisma.mmCountCompanyConfig.upsert({
            where: { companyId },
            create: { companyId, ...data },
            update: data,
        })
    }
}
