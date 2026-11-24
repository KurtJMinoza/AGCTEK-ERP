import { PrismaClient } from '@prisma/client'

/**
 * Removes demo/seed data for:
 *   • Sales Orders & Billing – Mission Control (MC-* POS import orders)
 *   • Reports & Analytics – Sales Analysis (same orders + scorecard targets)
 *   • Monthly Collection (MC-* + WALK-MC-SAMPLE; ext platform rows if tagged)
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-sd-reports-demo-seed.ts
 *   npx ts-node ... cleanup-sd-reports-demo-seed.ts --dry-run
 */
const ORDER_PREFIXES = ['MC-2026-XLSX', 'MC-SAMPLE-2026', 'SR-2026-XLSX']
const WALK_MC_CUSTOMER = 'WALK-MC-SAMPLE'
const WALK_SR_CUSTOMER = 'WALK-SR-SAMPLE'
const BILLING_DEMO_TAG = 'seed-sd-billing-demo'
const BILLING_INV_PREFIX = 'DEMO-INV-'

const dryRun = process.argv.includes('--dry-run')

async function main() {
    const prisma = new PrismaClient()
    try {
        const orders = await prisma.sdSalesOrder.findMany({
            where: {
                OR: ORDER_PREFIXES.map((p) => ({
                    orderNumber: { startsWith: p },
                })),
            },
            select: { id: true, orderNumber: true },
            orderBy: { orderNumber: 'asc' },
        })

        const demoInvoices = await prisma.sdSalesInvoice.findMany({
            where: {
                OR: [
                    { invoiceNumber: { startsWith: BILLING_INV_PREFIX } },
                    { createdBy: BILLING_DEMO_TAG },
                ],
            },
            select: { id: true, invoiceNumber: true },
        })

        const salesTargets = await prisma.sdSalesTarget.findMany({
            where: { updatedBy: 'seed' },
            select: { id: true, year: true, month: true },
        })

        const walkCustomer = await prisma.sdCustomer.findUnique({
            where: { customerNumber: WALK_MC_CUSTOMER },
            select: { id: true },
        })
        const walkSrCustomer = await prisma.sdCustomer.findUnique({
            where: { customerNumber: WALK_SR_CUSTOMER },
            select: { id: true },
        })

        const extTx = await prisma.sdExtPlatformTransaction.findMany({
            where: {
                OR: [
                    { transactionNumber: { startsWith: 'EPT-00000' } },
                    { createdBy: 'seed' },
                    { remarks: { contains: 'demo', mode: 'insensitive' } },
                ],
            },
            select: { id: true, transactionNumber: true, grandTotal: true },
        })

        console.log('SD reports / Mission Control seed cleanup')
        console.log(`  sales orders: ${orders.length}`)
        console.log(`  demo invoices: ${demoInvoices.length}`)
        console.log(`  sales targets (seed): ${salesTargets.length}`)
        console.log(`  walk-in customer: ${walkCustomer ? WALK_MC_CUSTOMER : '—'}`)
        console.log(
            `  sales-report walk-in: ${walkSrCustomer ? WALK_SR_CUSTOMER : '—'}`,
        )
        console.log(`  ext platform tx: ${extTx.length}`)

        if (
            !orders.length &&
            !demoInvoices.length &&
            !salesTargets.length &&
            !walkCustomer &&
            !walkSrCustomer &&
            !extTx.length
        ) {
            console.log('Nothing to remove.')
            return
        }

        if (dryRun) {
            console.log('Dry run — no changes written.')
            return
        }

        await prisma.$transaction(async (tx) => {
            if (demoInvoices.length) {
                await tx.sdSalesInvoiceLine.deleteMany({
                    where: {
                        invoiceId: {
                            in: demoInvoices.map((i) => i.id),
                        },
                    },
                })
                await tx.sdSalesInvoice.deleteMany({
                    where: { id: { in: demoInvoices.map((i) => i.id) } },
                })
            }

            if (orders.length) {
                await tx.sdSalesOrder.deleteMany({
                    where: { id: { in: orders.map((o) => o.id) } },
                })
            }

            if (extTx.length) {
                await tx.sdExtPlatformTransaction.deleteMany({
                    where: { id: { in: extTx.map((t) => t.id) } },
                })
            }

            if (salesTargets.length) {
                await tx.sdSalesTarget.deleteMany({
                    where: { id: { in: salesTargets.map((t) => t.id) } },
                })
            }

            if (walkCustomer) {
                const stillLinked = await tx.sdSalesOrder.count({
                    where: { customerId: walkCustomer.id },
                })
                const extLinked = await tx.sdExtPlatformTransaction.count({
                    where: { customerId: walkCustomer.id },
                })
                if (stillLinked === 0 && extLinked === 0) {
                    await tx.sdCustomer.delete({
                        where: { id: walkCustomer.id },
                    })
                }
            }

            if (walkSrCustomer) {
                const stillLinked = await tx.sdSalesOrder.count({
                    where: { customerId: walkSrCustomer.id },
                })
                if (stillLinked === 0) {
                    await tx.sdCustomer.delete({
                        where: { id: walkSrCustomer.id },
                    })
                }
            }
        })

        console.log('Cleanup complete.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})