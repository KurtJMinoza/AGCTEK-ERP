import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client'

/**
 * One-off cleanup: removes the POS walk-in customers captured during testing.
 *
 * Run from backend/:
 *   npm run prisma:cleanup-walk-in-customers -- --dry-run   # inspect only
 *   npm run prisma:cleanup-walk-in-customers               # delete
 *
 * The script refuses to delete when related records exist. Those relations use
 * onDelete: Restrict, so the database would reject the delete anyway.
 */
const CUSTOMER_NUMBERS = [
    'WALK-000001',
    'WALK-000002',
    'WALK-000003',
    'WALK-000004',
    'WALK-000005',
]

export async function cleanupWalkInCustomers(
    prisma: PrismaClientType,
    dryRun = false,
) {
    const customers = await prisma.sdCustomer.findMany({
        where: { customerNumber: { in: CUSTOMER_NUMBERS } },
        select: { id: true, customerNumber: true, companyName: true },
        orderBy: { customerNumber: 'asc' },
    })

    const found = new Set(customers.map((c) => c.customerNumber))
    for (const number of CUSTOMER_NUMBERS) {
        if (!found.has(number)) console.log(`  skip ${number}: not found`)
    }
    if (!customers.length) {
        console.log('Nothing to clean.')
        return
    }

    const blockers: string[] = []
    for (const customer of customers) {
        const counts = {
            sdQuotation: await prisma.sdQuotation.count({
                where: { customerId: customer.id },
            }),
            sdSalesReturn: await prisma.sdSalesReturn.count({
                where: { customerId: customer.id },
            }),
            crmProfile: await prisma.crmProfile.count({
                where: { customerId: customer.id },
            }),
            crmOpportunity: await prisma.crmOpportunity.count({
                where: { customerId: customer.id },
            }),
            crmTicket: await prisma.crmTicket.count({
                where: { customerId: customer.id },
            }),
            crmLoyaltyAccount: await prisma.crmLoyaltyAccount.count({
                where: { customerId: customer.id },
            }),
            sdExtPlatformTransaction: await prisma.sdExtPlatformTransaction.count({
                where: { customerId: customer.id },
            }),
        }
        for (const [table, count] of Object.entries(counts)) {
            if (count > 0) blockers.push(`${customer.customerNumber}: ${table}=${count}`)
        }
    }

    if (blockers.length) {
        console.error('Refusing to delete — related records exist:')
        for (const blocker of blockers) console.error(`  ${blocker}`)
        throw new Error('Clear the related records first, then rerun.')
    }

    if (dryRun) {
        console.log(`Dry run: would delete ${customers.length} walk-in customer(s).`)
        return
    }

    const result = await prisma.sdCustomer.deleteMany({
        where: { customerNumber: { in: CUSTOMER_NUMBERS } },
    })
    console.log(`Deleted ${result.count} walk-in customer(s).`)
}

if (require.main === module) {
    const prisma = new PrismaClient()
    cleanupWalkInCustomers(prisma, process.argv.includes('--dry-run'))
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
