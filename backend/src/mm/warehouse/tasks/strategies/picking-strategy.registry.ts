import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import {
    PickingStrategy,
    PickingStrategyCode,
    PickingStrategyContext,
} from './picking-strategy.interface'

@Injectable()
export class FifoPickingStrategy implements PickingStrategy {
    code = 'FIFO' as const

    constructor(private prisma: PrismaService) {}

    async suggestSourceBin(ctx: PickingStrategyContext) {
        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId: ctx.companyId,
                warehouseId: ctx.warehouseId,
                materialId: ctx.materialId,
                stockStatus: 'UNRESTRICTED',
                quantity: { gt: 0 },
                ...(ctx.batchId ? { batchId: ctx.batchId } : {}),
                ...(ctx.serialId ? { serialNumberId: ctx.serialId } : {}),
            },
            orderBy: { updatedAt: 'asc' },
        })

        for (const bal of balances) {
            if (!bal.storageBinId) continue
            const available = Number(bal.quantity) - Number(bal.reservedQuantity ?? 0)
            if (available >= ctx.requiredQty) {
                return {
                    storageBinId: bal.storageBinId,
                    batchId: bal.batchId ?? undefined,
                    serialNumberId: bal.serialNumberId ?? undefined,
                }
            }
        }
        return null
    }
}

@Injectable()
export class PickingStrategyRegistry {
    private strategies = new Map<PickingStrategyCode, PickingStrategy>()

    constructor(private fifo: FifoPickingStrategy) {
        this.strategies.set('FIFO', fifo)
        for (const code of ['FEFO', 'FIXED_BIN', 'NEAREST_BIN'] as PickingStrategyCode[]) {
            this.strategies.set(code, fifo)
        }
    }

    suggest(code: PickingStrategyCode | string | undefined, ctx: PickingStrategyContext) {
        const key = (code?.toUpperCase() ?? 'FIFO') as PickingStrategyCode
        return (this.strategies.get(key) ?? this.fifo).suggestSourceBin(ctx)
    }
}
