import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { UpsertConfigDto } from './dto/returns-disposal.dto'

@Injectable()
export class ReturnsDisposalConfigService {
    constructor(private prisma: PrismaService) {}

    async get(companyId: string) {
        return this.prisma.mmReturnsDisposalConfig.findUnique({
            where: { companyId },
        })
    }

    async upsert(dto: UpsertConfigDto) {
        return this.prisma.mmReturnsDisposalConfig.upsert({
            where: { companyId: dto.companyId },
            update: {
                ...(dto.approvalAmountThreshold !== undefined && {
                    approvalAmountThreshold: new Decimal(dto.approvalAmountThreshold),
                }),
                ...(dto.approvalQuantityThreshold !== undefined && {
                    approvalQuantityThreshold: new Decimal(dto.approvalQuantityThreshold),
                }),
                ...(dto.autoBlockExpired !== undefined && {
                    autoBlockExpired: dto.autoBlockExpired,
                }),
                ...(dto.expiredBlockStockStatus !== undefined && {
                    expiredBlockStockStatus: dto.expiredBlockStockStatus,
                }),
            },
            create: {
                companyId: dto.companyId,
                approvalAmountThreshold: new Decimal(dto.approvalAmountThreshold ?? 10000),
                approvalQuantityThreshold: new Decimal(dto.approvalQuantityThreshold ?? 0),
                autoBlockExpired: dto.autoBlockExpired ?? false,
                expiredBlockStockStatus: dto.expiredBlockStockStatus ?? 'EXPIRED',
            },
        })
    }

    async getThresholds(companyId: string) {
        const cfg = await this.get(companyId)
        return {
            amountThreshold: cfg
                ? Number(cfg.approvalAmountThreshold)
                : 10000,
            quantityThreshold: cfg
                ? Number(cfg.approvalQuantityThreshold)
                : 0,
        }
    }

    needsApproval(
        estimatedValue: number,
        totalQuantity: number,
        thresholds: { amountThreshold: number; quantityThreshold: number },
    ): boolean {
        if (estimatedValue > thresholds.amountThreshold) return true
        if (
            thresholds.quantityThreshold > 0 &&
            totalQuantity > thresholds.quantityThreshold
        )
            return true
        return false
    }
}
