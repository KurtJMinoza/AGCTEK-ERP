import { Injectable } from '@nestjs/common'
import type {
    CanPostToPeriodInput,
    CanPostToPeriodResult,
    FinancialPeriodPort,
} from '../mm/integration/fico/financial-period.port'
import { FicoFinancialPeriodService } from './financial-period.service'

@Injectable()
export class FicoFinancialPeriodAdapter implements FinancialPeriodPort {
    constructor(private periods: FicoFinancialPeriodService) {}

    canPostToPeriod(input: CanPostToPeriodInput): Promise<CanPostToPeriodResult> {
        return this.periods.canPostToPeriod(input)
    }
}
