import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Protects AP/AR reconciliation accounts from being used as ordinary G/L
 * accounts. Subledger documents pass `subledgerPosting`; direct/manual
 * postings are rejected before a journal can be persisted.
 */
@Injectable()
export class FicoApReconciliationGuardService {
    constructor(private readonly prisma: PrismaService) {}

    async assertPostingAllowed(input: {
        glAccountIds: readonly string[]
        subledgerPosting?: 'AP' | 'AR'
    }): Promise<void> {
        const glAccountIds = [...new Set(input.glAccountIds.filter(Boolean))]
        if (!glAccountIds.length) return
        if (input.subledgerPosting === 'AP' || input.subledgerPosting === 'AR') return

        const protectedAccounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                id: { in: glAccountIds },
                isReconciliationAccount: true,
                reconciliationType: { in: ['AP', 'AR'] },
            },
            select: {
                accountCode: true,
                accountName: true,
                reconciliationType: true,
            },
        })
        if (!protectedAccounts.length) return

        const labels = protectedAccounts
            .map(
                (account) =>
                    `${account.accountCode} (${account.accountName}, ${account.reconciliationType})`,
            )
            .join(', ')
        throw new BadRequestException(
            `Reconciliation account posting is restricted to the owning subledger: ${labels}. Create or reverse the AP/AR document instead of posting a direct journal.`,
        )
    }
}
