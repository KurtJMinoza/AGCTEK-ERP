import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
    FINANCIAL_PERIOD_PORT,
    type FinancialPeriodPort,
} from './financial-period.port'

@Injectable()
export class MmPostingPeriodGuard {
    constructor(
        @Inject(FINANCIAL_PERIOD_PORT)
        private periodPort: FinancialPeriodPort,
    ) {}

    async assertCanPost(companyId: string, postingDate: Date | string): Promise<void> {
        const result = await this.periodPort.canPostToPeriod({
            companyId,
            postingDate,
        })
        if (!result.allowed) {
            throw new BadRequestException(
                result.reason ??
                    `Posting not allowed for period ${result.periodKey ?? 'unknown'}`,
            )
        }
    }
}
