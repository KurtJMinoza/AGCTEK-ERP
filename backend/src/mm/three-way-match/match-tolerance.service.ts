import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { UpsertMatchToleranceDto } from './dto/three-way-match.dto'

export type ResolvedTolerances = {
    quantityTolerancePct: Decimal
    priceTolerancePct: Decimal
    absoluteToleranceAmount: Decimal
    overDeliveryPct: Decimal
    underDeliveryPct: Decimal
}

@Injectable()
export class MatchToleranceService {
    constructor(private prisma: PrismaService) {}

    async getCompanyConfig(companyId: string) {
        const existing = await this.prisma.mmPoToleranceConfig.findUnique({
            where: { companyId },
        })
        if (existing) return existing
        return {
            companyId,
            overDeliveryPct: new Decimal(0),
            underDeliveryPct: new Decimal(0),
            priceTolerancePct: new Decimal(0),
            quantityTolerancePct: new Decimal(0),
            absoluteToleranceAmount: new Decimal(0),
        }
    }

    async upsertCompanyConfig(dto: UpsertMatchToleranceDto) {
        return this.prisma.mmPoToleranceConfig.upsert({
            where: { companyId: dto.companyId },
            create: {
                companyId: dto.companyId,
                overDeliveryPct: dto.overDeliveryPct ?? 0,
                underDeliveryPct: dto.underDeliveryPct ?? 0,
                priceTolerancePct: dto.priceTolerancePct ?? 0,
                quantityTolerancePct: dto.quantityTolerancePct ?? 0,
                absoluteToleranceAmount: dto.absoluteToleranceAmount ?? 0,
            },
            update: {
                ...(dto.overDeliveryPct !== undefined
                    ? { overDeliveryPct: dto.overDeliveryPct }
                    : {}),
                ...(dto.underDeliveryPct !== undefined
                    ? { underDeliveryPct: dto.underDeliveryPct }
                    : {}),
                ...(dto.priceTolerancePct !== undefined
                    ? { priceTolerancePct: dto.priceTolerancePct }
                    : {}),
                ...(dto.quantityTolerancePct !== undefined
                    ? { quantityTolerancePct: dto.quantityTolerancePct }
                    : {}),
                ...(dto.absoluteToleranceAmount !== undefined
                    ? { absoluteToleranceAmount: dto.absoluteToleranceAmount }
                    : {}),
            },
        })
    }

    /**
     * Resolve tolerances: PO overrides → company config → 0.
     */
    async resolveForPo(purchaseOrderId: string): Promise<ResolvedTolerances> {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: purchaseOrderId },
        })
        const company = po
            ? await this.prisma.mmPoToleranceConfig.findUnique({
                  where: { companyId: po.companyId },
              })
            : null

        const qty =
            po?.quantityTolerancePctOverride ??
            company?.quantityTolerancePct ??
            0
        const price =
            po?.priceTolerancePctOverride ?? company?.priceTolerancePct ?? 0
        const over =
            po?.overDeliveryPctOverride ?? company?.overDeliveryPct ?? 0
        const under =
            po?.underDeliveryPctOverride ?? company?.underDeliveryPct ?? 0
        const abs = company?.absoluteToleranceAmount ?? 0

        return {
            quantityTolerancePct: new Decimal(qty),
            priceTolerancePct: new Decimal(price),
            absoluteToleranceAmount: new Decimal(abs),
            overDeliveryPct: new Decimal(over),
            underDeliveryPct: new Decimal(under),
        }
    }
}
