import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Protects supplier reconciliation accounts from being used as ordinary G/L
 * accounts. AP documents always pass through the AP subledger and provide the
 * `subledgerPosting` marker; direct/manual postings are rejected before a
 * journal can be persisted.
 */
@Injectable()
export class FicoApReconciliationGuardService {
    constructor(private readonly prisma: PrismaService) {}

    async assertPostingAllowed(input: {
        glAccountIds: readonly string[]
        subledgerPosting?: 'AP'
    }): Promise<void> {
        const glAccountIds = [...new Set(input.glAccountIds.filter(Boolean))]
        if (!glAccountIds.length || input.subledgerPosting === 'AP') return

        const protectedAccounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                id: { in: glAccountIds },
                isReconciliationAccount: true,
                reconciliationType: 'AP',
            },
            select: { accountCode: true, accountName: true },
        })
        if (!protectedAccounts.length) return

        const labels = protectedAccounts
            .map((account) => `${account.accountCode} (${account.accountName})`)
            .join(', ')
        throw new BadRequestException(
            `Supplier reconciliation account posting is restricted to the Accounts Payable subledger: ${labels}. Create or reverse the AP document instead of posting a direct journal.`,
        )
    }
}
