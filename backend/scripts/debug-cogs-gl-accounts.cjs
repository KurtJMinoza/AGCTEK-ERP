const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const companyId = 'cmuxpv53h0000os8k838k61xg'

async function main() {
    const settings = await p.ficoCompanyAccountingSettings.findFirst({
        where: { companyId },
        select: {
            defaultCostOfGoodsSoldAccountId: true,
            defaultInventoryAccountId: true,
            chartOfAccountsId: true,
        },
    })
    const ids = [
        settings?.defaultCostOfGoodsSoldAccountId,
        settings?.defaultInventoryAccountId,
    ].filter(Boolean)
    const accounts = await p.ficoGlAccount.findMany({
        where: { id: { in: ids } },
        select: {
            id: true,
            accountCode: true,
            accountName: true,
            status: true,
            chartOfAccountsId: true,
        },
    })
    console.log('settings', settings)
    console.log('accounts', accounts)
    const assigns = await p.ficoCompanyGlAccount.findMany({
        where: { companyId, glAccountId: { in: ids } },
        include: { glAccount: { select: { accountCode: true, accountName: true } } },
    })
    console.log('companyAssignments', assigns)
    const control = await p.ficoCompanyGlAccount.findMany({
        where: {
            companyId,
            glAccount: { accountCode: { in: ['1000', '4000'] } },
        },
        include: { glAccount: { select: { accountCode: true } } },
    })
    console.log('revenueAccountsAssigned', control)
}

main().finally(() => p.$disconnect())