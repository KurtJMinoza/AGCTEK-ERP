import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    PutawayStrategy,
    PutawayStrategyContext,
} from './putaway-strategy.interface'

@Injectable()
export class CapacityBasedPutawayStrategy implements PutawayStrategy {
    code = 'CAPACITY_BASED' as const

    constructor(private prisma: PrismaService) {}

    async recommend(ctx: PutawayStrategyContext): Promise<string | null> {
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: ctx.materialId },
        })
        const bins = await this.prisma.wmStorageBin.findMany({
            where: {
                status: 'ACTIVE',
                putawayAllowed: true,
                deletedAt: null,
                storageSection: {
                    deletedAt: null,
                    status: 'ACTIVE',
                    storageType: {
                        warehouseId: ctx.warehouseId,
                        status: 'ACTIVE',
                        putawayAllowed: true,
                        deletedAt: null,
                    },
                },
            },
            include: {
                storageSection: { include: { storageType: true } },
            },
        })

        const binIds = bins.map((b) => b.id)
        const balances = binIds.length
            ? await this.prisma.mmInventoryBalance.findMany({
                  where: {
                      storageBinId: { in: binIds },
                      stockStatus: ctx.stockStatus ?? 'UNRESTRICTED',
                  },
                  select: { storageBinId: true, materialId: true, quantity: true },
              })
            : []

        const usedByBin = new Map<string, Decimal>()
        const materialAffinity = new Set<string>()
        for (const bal of balances) {
            if (!bal.storageBinId) continue
            usedByBin.set(
                bal.storageBinId,
                (usedByBin.get(bal.storageBinId) ?? new Decimal(0)).plus(bal.quantity),
            )
            if (bal.materialId === ctx.materialId) materialAffinity.add(bal.storageBinId)
        }

        type Candidate = {
            id: string
            remaining: Decimal
            sameMaterial: boolean
            typeScore: number
        }
        const candidates: Candidate[] = []

        for (const bin of bins) {
            const st = bin.storageSection.storageType
            const usedQty = usedByBin.get(bin.id) ?? new Decimal(0)
            const capacity = new Decimal(bin.capacityQuantity ?? 0)
            const remaining = capacity.lte(0)
                ? new Decimal(Number.MAX_SAFE_INTEGER)
                : capacity.minus(usedQty)
            if (capacity.gt(0) && remaining.lt(ctx.quantity)) continue

            if (material?.weight && bin.capacityWeight && Number(bin.capacityWeight) > 0) {
                const addWeight = new Decimal(material.weight).mul(ctx.quantity)
                if (addWeight.gt(bin.capacityWeight)) continue
            }
            if (material?.volume && bin.capacityVolume && Number(bin.capacityVolume) > 0) {
                const addVol = new Decimal(material.volume).mul(ctx.quantity)
                if (addVol.gt(bin.capacityVolume)) continue
            }

            let typeScore = 0
            if (st.qualityControlled) typeScore -= 1
            if (st.hazardous) typeScore -= 1
            if (st.temperatureControlled) typeScore -= 1
            if (st.receivingAllowed || st.shippingAllowed) typeScore -= 2

            candidates.push({
                id: bin.id,
                remaining,
                sameMaterial: materialAffinity.has(bin.id),
                typeScore,
            })
        }

        if (!candidates.length) return null

        candidates.sort((a, b) => {
            if (a.sameMaterial !== b.sameMaterial) return a.sameMaterial ? -1 : 1
            if (a.typeScore !== b.typeScore) return b.typeScore - a.typeScore
            return a.remaining.minus(b.remaining).toNumber()
        })

        return candidates[0].id
    }
}
