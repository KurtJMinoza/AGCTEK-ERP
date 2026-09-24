import { Injectable } from '@nestjs/common'
import {
    PutawayStrategy,
    PutawayStrategyCode,
    PutawayStrategyContext,
} from './putaway-strategy.interface'
import { CapacityBasedPutawayStrategy } from './capacity-based-putaway.strategy'

class FallbackPutawayStrategy implements PutawayStrategy {
    constructor(
        public code: PutawayStrategyCode,
        private fallback: PutawayStrategy,
    ) {}

    recommend(ctx: PutawayStrategyContext) {
        return this.fallback.recommend(ctx)
    }
}

class FixedBinPutawayStrategy implements PutawayStrategy {
    code = 'FIXED_BIN' as const

    constructor(private fallback: PutawayStrategy) {}

    recommend(ctx: PutawayStrategyContext) {
        return this.fallback.recommend(ctx)
    }
}

@Injectable()
export class PutawayStrategyRegistry {
    private strategies = new Map<PutawayStrategyCode, PutawayStrategy>()

    constructor(private capacityBased: CapacityBasedPutawayStrategy) {
        const defaultStrategy = capacityBased
        this.strategies.set('CAPACITY_BASED', defaultStrategy)
        this.strategies.set('FIXED_BIN', new FixedBinPutawayStrategy(defaultStrategy))

        for (const code of [
            'NEAREST_BIN',
            'MATERIAL_ZONE',
            'TEMPERATURE_ZONE',
            'FIFO_ZONE',
            'FEFO_ZONE',
        ] as PutawayStrategyCode[]) {
            this.strategies.set(code, new FallbackPutawayStrategy(code, defaultStrategy))
        }
    }

    async recommend(
        code: PutawayStrategyCode | string | undefined,
        ctx: PutawayStrategyContext,
    ): Promise<string | null> {
        const key = (code?.toUpperCase() ?? 'CAPACITY_BASED') as PutawayStrategyCode
        const strategy = this.strategies.get(key) ?? this.capacityBased
        return strategy.recommend(ctx)
    }
}
