import { PrismaClient } from '@prisma/client'

/**
 * Removes Monthly Collection demo orders seeded from Excel / legacy sample.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-monthly-collection-seed.ts
 *   npx ts-node ... cleanup-monthly-collection-seed.ts --dry-run
 */
const PREFIXES = ['MC-SAMPLE-2026', 'MC-2026-XLSX']

const dryRun = process.argv.includes('--dry-run')

async function main() {
    const prisma = new PrismaClient()
    try {
        const orders = await prisma.sdSalesOrder.findMany({
            where: {
                OR: PREFIXES.map((p) => ({
                    orderNumber: { startsWith: p },
                })),
            },
            select: { id: true, orderNumber: true },
            orderBy: { orderNumber: 'asc' },
        })
        if (!orders.length) {
            console.log('No monthly collection seed orders found.')
            return
        }
        console.log(
            `${dryRun ? 'Would delete' : 'Deleting'} ${orders.length} order(s)…`,
        )
        for (const o of orders) {
            console.log(`  ${o.orderNumber}`)
        }
        if (dryRun) return
        await prisma.sdSalesOrder.deleteMany({
            where: { id: { in: orders.map((o) => o.id) } },
        })
        console.log('Done.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})