import { Injectable, BadRequestException } from '@nestjs/common'
import { FifoValuationStrategy } from './fifo-valuation.strategy'
import { MovingAverageValuationStrategy } from './moving-average-valuation.strategy'
import { StandardCostValuationStrategy } from './standard-cost-valuation.strategy'
import { ValuationMethodStrategy } from './valuation-method.interface'
import { VALUATION_METHODS } from '../valuation.constants'

@Injectable()
export class ValuationMethodRegistry {
    private readonly byCode: Map<string, ValuationMethodStrategy>

    constructor(
        fifo: FifoValuationStrategy,
        map: MovingAverageValuationStrategy,
        standard: StandardCostValuationStrategy,
    ) {
        this.byCode = new Map([
            [fifo.code, fifo],
            [map.code, map],
            [standard.code, standard],
        ])
    }

    get(method: string): ValuationMethodStrategy {
        const strategy = this.byCode.get(method)
        if (!strategy) {
            throw new BadRequestException(
                `Unsupported valuation method ${method}. Supported: ${VALUATION_METHODS.join(', ')}`,
            )
        }
        return strategy
    }
}
