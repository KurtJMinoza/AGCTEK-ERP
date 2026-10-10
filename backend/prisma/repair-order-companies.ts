import { PrismaClient } from '@prisma/client'

/**
 * Safe company backfill for sales orders created before checkout stored
 * companyId (Organization / Materials Management company).
 *
 * Rule: only runs when exactly ONE company exists in the Organization. It sets
 * `companyId` on sales orders (and their lines) that are null/invalid — it
 * never overwrites an existing valid company and never guesses when the org
 * has multiple companies (multi-company orders stay untouched).
 *
 * Run: npm run prisma:repair-order-companies
 */
export async function repairOrderCompanies(prisma: PrismaClient) {
    const companies = await prisma.company.findMany({
        select: { id: true, code: true },
        orderBy: { createdAt: 'asc' },
    })
    if (companies.length === 0) {
        console.log('No companies in Organization — nothing to backfill.')
        return { updatedOrders: 0, updatedLines: 0 }
    }
    if (companies.length !== 1) {
        console.log(
            `Skip: ${companies.length} companies exist. Refusing to guess — ` +
                'orders without companyId need an explicit assignment.',
        )
        return { updatedOrders: 0, updatedLines: 0 }
    }
    const companyId = companies[0].id
    const orders = await prisma.$executeRawUnsafe(
        `UPDATE "sd_sales_orders" SET "companyId" = $1 WHERE "companyId" IS NULL`,
        companyId,
    )
    const lines = await prisma.$executeRawUnsafe(
        `UPDATE "sd_sales_order_lines" SET "companyId" = $1
         WHERE "companyId" IS NULL
           AND EXISTS (
             SELECT 1 FROM "sd_sales_orders" o
             WHERE o.id = "sd_sales_order_lines"."salesOrderId"
               AND o."companyId" = $1
           )`,
        companyId,
    )
    console.log(
        `Backfilled company ${companies[0].code} (${companyId}): ` +
            `${orders} order(s), ${lines} line(s).`,
    )
    return { updatedOrders: orders, updatedLines: lines }
}

if (require.main === module) {
    const prisma = new PrismaClient()
    repairOrderCompanies(prisma)
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}