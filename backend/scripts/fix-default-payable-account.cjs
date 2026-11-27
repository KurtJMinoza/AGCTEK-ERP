/**
 * Point company defaultPayableAccountId at an AP reconciliation 210100 (company COA first).
 *
 *   node scripts/fix-default-payable-account.cjs
 *   node scripts/fix-default-payable-account.cjs --dry-run
 */
const { PrismaClient } = require('@prisma/client')

const dryRun = process.argv.includes('--dry-run')

async function main() {
    const prisma = new PrismaClient()
    try {
        const settings = await prisma.ficoCompanyAccountingSettings.findMany({
            select: {
                id: true,
                companyId: true,
                chartOfAccountsId: true,
                defaultPayableAccountId: true,
            },
        })
        for (const row of settings) {
            const current = row.defaultPayableAccountId
                ? await prisma.ficoGlAccount.findUnique({
                      where: { id: row.defaultPayableAccountId },
                      select: {
                          id: true,
                          accountCode: true,
                          isReconciliationAccount: true,
                          reconciliationType: true,
                      },
                  })
                : null
            const payable =
                (await prisma.ficoGlAccount.findFirst({
                    where: {
                        accountCode: '210100',
                        isReconciliationAccount: true,
                        reconciliationType: 'AP',
                        status: 'ACTIVE',
                        ...(row.chartOfAccountsId
                            ? { chartOfAccountsId: row.chartOfAccountsId }
                            : {}),
                    },
                })) ??
                (await prisma.ficoGlAccount.findFirst({
                    where: {
                        accountCode: '210100',
                        isReconciliationAccount: true,
                        reconciliationType: 'AP',
                        status: 'ACTIVE',
                        companyAssignments: {
                            some: { companyId: row.companyId, postingEnabled: true },
                        },
                    },
                }))
            console.log({
                companyId: row.companyId,
                current,
                target: payable
                    ? { id: payable.id, code: payable.accountCode }
                    : null,
            })
            if (!payable || dryRun) continue
            const valid =
                current?.isReconciliationAccount &&
                current?.reconciliationType === 'AP'
            if (!valid || current.id !== payable.id) {
                await prisma.ficoCompanyAccountingSettings.update({
                    where: { id: row.id },
                    data: { defaultPayableAccountId: payable.id },
                })
            }
        }
        await prisma.ficoGlAccount.updateMany({
            where: { accountCode: '210100', accountType: 'LIABILITY' },
            data: {
                isReconciliationAccount: true,
                reconciliationType: 'AP',
                openItemManagement: true,
                allowAutomaticPosting: true,
            },
        })
        if (dryRun) console.log('Dry run — no settings updates (account flags would run).')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})