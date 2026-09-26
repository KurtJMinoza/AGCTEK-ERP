import { Injectable, BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * FICO budget integration boundary.
 * Does not duplicate Finance budget engine — stub validates locally until FICO is wired.
 */
@Injectable()
export class ProcurementBudgetService {
    /**
     * Validate PR budget before approval workflow.
     * Returns validation metadata for audit; throws when hard validation fails.
     */
    async validatePrBudget(params: {
        companyId: string
        costCenterId?: string | null
        projectId?: string | null
        amount: Decimal | number
        externalBudgetCheck?: boolean
    }): Promise<{ validated: boolean; externalRef?: string; message: string }> {
        const amount = new Decimal(params.amount)
        if (amount.lt(0)) {
            throw new BadRequestException('PR amount cannot be negative')
        }

        // Stub: pass-through unless explicit external check requested and fails
        if (params.externalBudgetCheck === false) {
            throw new BadRequestException('Budget validation rejected by FICO integration')
        }

        return {
            validated: true,
            externalRef: `MM-BUDGET-STUB-${params.companyId}`,
            message: 'Budget validation passed (MM stub — wire FICO budget service for production)',
        }
    }
}
