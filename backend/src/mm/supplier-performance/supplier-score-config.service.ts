import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    UpsertWeightConfigDto,
    UpsertAlertConfigDto,
} from './dto/supplier-performance.dto'
import type { ScoreWeights } from './score-engine'

/** Defaults: delivery/quality/price/quantity/service/compliance = 25/25/20/15/10/5 */
const DEFAULT_WEIGHTS: ScoreWeights = {
    deliveryWeight: 25,
    qualityWeight: 25,
    priceWeight: 20,
    quantityWeight: 15,
    serviceWeight: 10,
    complianceWeight: 5,
}

@Injectable()
export class SupplierScoreConfigService {
    constructor(private prisma: PrismaService) {}

    async getWeights(companyId: string) {
        const row = await this.prisma.mmSupplierScoreWeightConfig.findUnique({
            where: { companyId },
        })
        if (row) return row
        return {
            id: null,
            companyId,
            ...DEFAULT_WEIGHTS,
            createdAt: null,
            updatedAt: null,
        }
    }

    async upsertWeights(dto: UpsertWeightConfigDto) {
        const quantityWeight = dto.quantityWeight ?? 0
        const sum =
            dto.deliveryWeight +
            dto.qualityWeight +
            dto.priceWeight +
            quantityWeight +
            dto.serviceWeight +
            dto.complianceWeight
        if (sum !== 100) {
            throw new BadRequestException(`Weights must sum to 100 (got ${sum})`)
        }
        return this.prisma.mmSupplierScoreWeightConfig.upsert({
            where: { companyId: dto.companyId },
            create: {
                companyId: dto.companyId,
                deliveryWeight: dto.deliveryWeight,
                qualityWeight: dto.qualityWeight,
                priceWeight: dto.priceWeight,
                quantityWeight,
                serviceWeight: dto.serviceWeight,
                complianceWeight: dto.complianceWeight,
            },
            update: {
                deliveryWeight: dto.deliveryWeight,
                qualityWeight: dto.qualityWeight,
                priceWeight: dto.priceWeight,
                quantityWeight,
                serviceWeight: dto.serviceWeight,
                complianceWeight: dto.complianceWeight,
            },
        })
    }

    async getAlertConfig(companyId: string) {
        const row = await this.prisma.mmSupplierAlertConfig.findUnique({
            where: { companyId },
        })
        if (row) return row
        return {
            id: null,
            companyId,
            scoreThreshold: new Decimal(70),
            lateDeliveryRateThreshold: new Decimal(0.25),
            rejectionRateThreshold: new Decimal(0.1),
            shortageRateThreshold: new Decimal(0.15),
            priceVarianceThreshold: new Decimal(0.1),
            isActive: true,
            createdAt: null,
            updatedAt: null,
        }
    }

    async upsertAlertConfig(dto: UpsertAlertConfigDto) {
        return this.prisma.mmSupplierAlertConfig.upsert({
            where: { companyId: dto.companyId },
            create: {
                companyId: dto.companyId,
                scoreThreshold: new Decimal(dto.scoreThreshold),
                lateDeliveryRateThreshold: new Decimal(
                    dto.lateDeliveryRateThreshold ?? 0.25,
                ),
                rejectionRateThreshold: new Decimal(
                    dto.rejectionRateThreshold ?? 0.1,
                ),
                shortageRateThreshold: new Decimal(
                    dto.shortageRateThreshold ?? 0.15,
                ),
                priceVarianceThreshold: new Decimal(
                    dto.priceVarianceThreshold ?? 0.1,
                ),
                isActive: dto.isActive ?? true,
            },
            update: {
                scoreThreshold: new Decimal(dto.scoreThreshold),
                ...(dto.lateDeliveryRateThreshold !== undefined
                    ? {
                          lateDeliveryRateThreshold: new Decimal(
                              dto.lateDeliveryRateThreshold,
                          ),
                      }
                    : {}),
                ...(dto.rejectionRateThreshold !== undefined
                    ? {
                          rejectionRateThreshold: new Decimal(
                              dto.rejectionRateThreshold,
                          ),
                      }
                    : {}),
                ...(dto.shortageRateThreshold !== undefined
                    ? {
                          shortageRateThreshold: new Decimal(
                              dto.shortageRateThreshold,
                          ),
                      }
                    : {}),
                ...(dto.priceVarianceThreshold !== undefined
                    ? {
                          priceVarianceThreshold: new Decimal(
                              dto.priceVarianceThreshold,
                          ),
                      }
                    : {}),
                ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
        })
    }

    toWeights(row: {
        deliveryWeight: number
        qualityWeight: number
        priceWeight: number
        quantityWeight?: number
        serviceWeight: number
        complianceWeight: number
    }): ScoreWeights {
        return {
            deliveryWeight: row.deliveryWeight,
            qualityWeight: row.qualityWeight,
            priceWeight: row.priceWeight,
            quantityWeight: row.quantityWeight ?? 0,
            serviceWeight: row.serviceWeight,
            complianceWeight: row.complianceWeight,
        }
    }
}
