import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const companyId = 'cmuxpv53h0000os8k838k61xg'

async function main() {
    const settings = await prisma.ficoCompanyAccountingSettings.findFirst({
        where: { companyId },
        include: {
            defaultReceivableAccount: { select: { id: true, accountCode: true, name: true } },
            defaultCashAccount: { select: { id: true, accountCode: true, name: true } },
            defaultSalesRevenueAccount: { select: { id: true, accountCode: true, name: true } },
            defaultTaxOutputAccount: { select: { id: true, accountCode: true, name: true } },
        },
    })
    console.log('settings', JSON.stringify(settings, null, 2))
    const rules = await prisma.ficoAccountDeterminationRule.findMany({
        where: {
            companyId,
            sourceModule: 'SD',
            status: 'ACTIVE',
            transactionKey: { in: ['CUSTOMER_RECON', 'ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'OUTPUT_TAX', 'PAYMENT_CLEARING'] },
        },
        select: { transactionKey: true, ruleName: true, effectiveFrom: true, effectiveTo: true },
        take: 20,
    })
    console.log('sd rules', rules)
}

main()
    .finally(() => prisma.$disconnect())