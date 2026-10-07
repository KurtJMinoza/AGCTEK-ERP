import { Injectable } from '@nestjs/common'
import type { CrmLoyaltyTransaction } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { assertCustomerExists } from '../crm-references'

const RECENT_TRANSACTIONS = 50

export type LoyaltySummary = {
    accountId: string | null
    customerId: string
    pointsBalance: number
    tier: string | null
    /** Most recent first, capped at RECENT_TRANSACTIONS. */
    transactions: CrmLoyaltyTransaction[]
}

@Injectable()
export class CrmLoyaltyService {
    constructor(private readonly prisma: PrismaService) {}

    async getForCustomer(customerId: string): Promise<LoyaltySummary> {
        await assertCustomerExists(this.prisma, customerId)
        return this.summary(customerId)
    }

    /**
     * Read-only. A customer without a loyalty account gets an empty default instead of a 404.
     * Caller must have confirmed the SdCustomer exists.
     */
    async summary(customerId: string): Promise<LoyaltySummary> {
        // TODO(crm-integration): points accrual (EARN) from FICO invoice clearance and REDEEM flows are not implemented.
        const account = await this.prisma.crmLoyaltyAccount.findUnique({
            where: { customerId },
            include: {
                transactions: { orderBy: { createdAt: 'desc' }, take: RECENT_TRANSACTIONS },
            },
        })
        if (!account) {
            return { accountId: null, customerId, pointsBalance: 0, tier: null, transactions: [] }
        }
        return {
            accountId: account.id,
            customerId,
            pointsBalance: account.pointsBalance,
            tier: account.tier,
            transactions: account.transactions,
        }
    }
}
