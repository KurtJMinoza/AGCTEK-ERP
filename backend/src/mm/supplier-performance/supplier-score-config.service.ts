import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    UpsertWeightConfigDto,
    UpsertAlertConfigDto,
} from './dto/supplier-performance.dto'
import type { ScoreWeights } from './score-engine'

const DEFAULT_WEIGHTS: ScoreWeights = {
    deliveryWeight: 30,
    qualityWeight: 30,
    priceWeight: 20,
    serviceWeight: 10,
    complianceWeight: 10,
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
        const sum =
            dto.deliveryWeight +
            dto.qualityWeight +
            dto.priceWeight +
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
                serviceWeight: dto.serviceWeight,
                complianceWeight: dto.complianceWeight,
            },
            update: {
                deliveryWeight: dto.deliveryWeight,
                qualityWeight: dto.qualityWeight,
                priceWeight: dto.priceWeight,
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
                isActive: dto.isActive ?? true,
            },
            update: {
                scoreThreshold: new Decimal(dto.scoreThreshold),
                ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
        })
    }

    toWeights(row: {
        deliveryWeight: number
        qualityWeight: number
        priceWeight: number
        serviceWeight: number
        complianceWeight: number
    }): ScoreWeights {
        return {
            deliveryWeight: row.deliveryWeight,
            qualityWeight: row.qualityWeight,
            priceWeight: row.priceWeight,
            serviceWeight: row.serviceWeight,
            complianceWeight: row.complianceWeight,
        }
    }
}
