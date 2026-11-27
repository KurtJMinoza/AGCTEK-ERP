import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Protects reconciliation accounts from being used as ordinary G/L accounts.
 * Manual journals never touch them by default. AP postings must come from the
 * AP subledger; automatic AR/GR-IR/bank/asset/tax postings keep their existing
 * controlled paths.
 */
@Injectable()
export class FicoApReconciliationGuardService {
    constructor(private readonly prisma: PrismaService) {}

    async assertPostingAllowed(input: {
        glAccountIds: readonly string[]
        source?: 'MANUAL' | 'AUTOMATIC'
        subledgerPosting?: 'AP' | 'AR'
        reconciliationPolicy?: string
    }): Promise<void> {
        const glAccountIds = [...new Set(input.glAccountIds.filter(Boolean))]
        if (
            !glAccountIds.length ||
            input.subledgerPosting === 'AP' ||
            input.subledgerPosting === 'AR'
        ) {
            return
        }

        const protectedAccounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                id: { in: glAccountIds },
                isReconciliationAccount: true,
            },
            select: { accountCode: true, accountName: true, reconciliationType: true },
        })
        if (!protectedAccounts.length) return

        const source = input.source ?? 'MANUAL'
        if (
            source === 'MANUAL' &&
            input.reconciliationPolicy !== 'ALLOW_MANUAL'
        ) {
            const manualProtected = protectedAccounts.filter((account) =>
                ['AP', 'AR'].includes(account.reconciliationType ?? ''),
            )
            if (manualProtected.length) {
                this.reject(
                    manualProtected,
                    'Direct manual posting to AP/AR reconciliation accounts is restricted. Use the owning subledger instead.',
                )
            }
        }
        if (source === 'AUTOMATIC') {
            const unauthorizedAp = protectedAccounts.filter(
                (account) =>
                    account.reconciliationType === 'AP' &&
                    input.subledgerPosting !== 'AP',
            )
            if (unauthorizedAp.length) {
                this.reject(
                    unauthorizedAp,
                    'Supplier reconciliation account posting is restricted to the Accounts Payable subledger. Create or reverse the AP document instead of posting a direct journal.',
                )
            }
            const unauthorizedAr = protectedAccounts.filter(
                (account) =>
                    account.reconciliationType === 'AR' &&
                    input.subledgerPosting !== 'AR',
            )
            if (unauthorizedAr.length) {
                this.reject(
                    unauthorizedAr,
                    'Customer reconciliation account posting is restricted to the Accounts Receivable subledger.',
                )
            }
        }
    }

    private reject(
        accounts: Array<{
            accountCode: string
            accountName: string
            reconciliationType: string | null
        }>,
        reason: string,
    ): never {
        const labels = accounts
            .map(
                (account) =>
                    `${account.accountCode} (${account.accountName}${account.reconciliationType ? `, ${account.reconciliationType}` : ''})`,
            )
            .join(', ')
        throw new BadRequestException(`${reason}: ${labels}.`)
    }
}
