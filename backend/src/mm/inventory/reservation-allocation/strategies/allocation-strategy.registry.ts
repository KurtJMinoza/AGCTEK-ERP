import { Injectable, BadRequestException } from '@nestjs/common'
import { FifoAllocationStrategy } from './fifo-allocation.strategy'
import { FefoAllocationStrategy } from './fefo-allocation.strategy'
import {
    AllocationCandidate,
    AllocationStrategy,
    AllocationStrategyContext,
} from './allocation-strategy.interface'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class AllocationStrategyRegistry {
    private strategies: Map<string, AllocationStrategy>

    constructor(
        private fifo: FifoAllocationStrategy,
        private fefo: FefoAllocationStrategy,
    ) {
        this.strategies = new Map([
            [this.fifo.code, this.fifo],
            [this.fefo.code, this.fefo],
        ])
    }

    plan(
        strategyCode: string,
        ctx: AllocationStrategyContext,
        candidates: AllocationCandidate[],
    ): AllocationCandidate[] {
        if (strategyCode === 'CUSTOM') {
            if (!ctx.customLines?.length) {
                throw new BadRequestException('CUSTOM strategy requires explicit lines')
            }
            return ctx.customLines.map((l) => ({
                storageBinId: l.storageBinId,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                availableQuantity: new Decimal(l.quantity),
            }))
        }

        const strategy = this.strategies.get(strategyCode) ?? this.fifo
        if (strategyCode === 'BIN_PRIORITY') {
            const sorted = [...candidates].sort(
                (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
            )
            return (strategy as FifoAllocationStrategy).plan(ctx, sorted)
        }
        if (strategyCode === 'FIXED_BIN') {
            const fixed = candidates.filter((c) => (c.priority ?? 999) === 0)
            return strategy.plan(ctx, fixed.length ? fixed : candidates)
        }
        return strategy.plan(ctx, candidates)
    }
}
