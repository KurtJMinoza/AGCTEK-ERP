import { Injectable } from '@nestjs/common'
import { FifoAllocationStrategy } from './fifo-allocation.strategy'
import { AllocationCandidate, AllocationStrategyContext } from './allocation-strategy.interface'

@Injectable()
export class FefoAllocationStrategy extends FifoAllocationStrategy {
    code = 'FEFO'

    plan(ctx: AllocationStrategyContext, candidates: AllocationCandidate[]) {
        const now = Date.now()
        // Drop past-expiry candidates (EXPIRED status balances are already excluded upstream)
        const eligible = candidates.filter((c) => {
            if (c.batchExpiry && c.batchExpiry.getTime() < now) return false
            return true
        })
        const sorted = [...eligible].sort((a, b) => {
            const ae = a.batchExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER
            const be = b.batchExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER
            if (ae !== be) return ae - be
            return (a.binCode ?? a.storageBinId).localeCompare(b.binCode ?? b.storageBinId)
        })
        return this.takeQty(sorted, ctx.quantity)
    }
}
