import { PrismaClient } from '@prisma/client'

/**
 * Read-only report: shop (storefront) accounts that have sales orders but are linked to no
 * Customer Master. Their orders are missing from CRM Customer 360 and their returns cannot open a
 * CRM case. For each, shows a Customer Master with the same email (link candidate). Nothing is
 * changed: link in SD Customer Master (`retailClientId`); order `customerId`s are never rewritten.
 *
 * Run: npm run prisma:report-unlinked-shop-accounts
 */
export async function reportUnlinkedShopAccounts(prisma: PrismaClient) {
    const accounts = await prisma.retailClient.findMany({
        where: { sdCustomer: null },
        select: { id: true, email: true, fullName: true },
    })
    const rows: Array<Record<string, string | number>> = []
    for (const account of accounts) {
        const orders = await prisma.sdSalesOrder.count({ where: { customerId: account.id } })
        if (orders === 0) continue
        const candidate = await prisma.sdCustomer.findFirst({
            where: { email: { equals: account.email, mode: 'insensitive' } },
            select: { customerNumber: true, retailClientId: true },
        })
        rows.push({
            shopAccount: account.email,
            name: account.fullName,
            orders,
            masterWithSameEmail: candidate
                ? `${candidate.customerNumber}${candidate.retailClientId ? ' (linked to another shop account)' : ''}`
                : '— (create or pick a Customer Master)',
        })
    }
    if (rows.length === 0) {
        console.log('Every shop account with orders is linked to a Customer Master.')
    } else {
        console.table(rows)
    }
    return rows
}

if (require.main === module) {
    const prisma = new PrismaClient()
    reportUnlinkedShopAccounts(prisma)
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
