const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const settings = await prisma.ficoCompanyAccountingSettings.findFirst({
        where: { companyId: 'cmuxpv53h0000os8k838k61xg' },
        select: {
            status: true,
            defaultReceivableAccountId: true,
            defaultCashAccountId: true,
            defaultSalesRevenueAccountId: true,
            defaultTaxOutputAccountId: true,
            chartOfAccountsId: true,
        },
    })
    console.log(settings)
}

main().finally(() => prisma.$disconnect())