import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import {
    AllocationCandidate,
    AllocationStrategy,
    AllocationStrategyContext,
} from './allocation-strategy.interface'

@Injectable()
export class FifoAllocationStrategy implements AllocationStrategy {
    code = 'FIFO'

    plan(ctx: AllocationStrategyContext, candidates: AllocationCandidate[]) {
        const sorted = [...candidates].sort((a, b) =>
            (a.binCode ?? a.storageBinId).localeCompare(b.binCode ?? b.storageBinId),
        )
        return this.takeQty(sorted, ctx.quantity)
    }

    protected takeQty(sorted: AllocationCandidate[], qty: Decimal) {
        let remaining = qty
        const picks: AllocationCandidate[] = []
        for (const c of sorted) {
            if (remaining.lte(0)) break
            const take = Decimal.min(c.availableQuantity, remaining)
            if (take.lte(0)) continue
            picks.push({ ...c, availableQuantity: take })
            remaining = remaining.minus(take)
        }
        return picks
    }
}
