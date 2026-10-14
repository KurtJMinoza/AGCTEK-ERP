/**
 * DEMO invoices for the SD Billing page (/modules/sd/billing).
 *
 *   npm run prisma:seed-billing-demo    → (re)create the demo invoices (cleans first)
 *   npm run prisma:clean-billing-demo   → remove everything this script created
 *
 * Real invoices are issued by the goods-issue listener. These demo rows are attached
 * only to orders that already shipped without an invoice, so a later goods issue can
 * never collide with them. Amounts and lines are copied from the sales order.
 *
 * Tagged for cleanup: invoiceNumber "DEMO-INV-*", createdBy "seed-sd-billing-demo".
 */
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TAG = 'seed-sd-billing-demo'
const NUMBER_PREFIX = 'DEMO-INV-'
const DAY_MS = 24 * 60 * 60 * 1000
const SHIPPED_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED']

type DemoCase = {
    status: 'ISSUED' | 'PAID' | 'CANCELLED' | 'REFUNDED'
    issuedDaysAgo: number
    paidDaysAgo?: number
    /** Share of the total refunded (REFUNDED / partial refunds). */
    refundShare?: number
    notes?: string
}

/** Unpaid (issued < 30 days), overdue (> 30 days), paid, cancelled and refunded. */
const CASES: DemoCase[] = [
    { status: 'ISSUED', issuedDaysAgo: 2 },
    { status: 'ISSUED', issuedDaysAgo: 9 },
    { status: 'ISSUED', issuedDaysAgo: 18, refundShare: 0.1, notes: 'Partial refund for one damaged unit.' },
    { status: 'ISSUED', issuedDaysAgo: 27 },
    { status: 'ISSUED', issuedDaysAgo: 36 },
    { status: 'ISSUED', issuedDaysAgo: 52 },
    { status: 'ISSUED', issuedDaysAgo: 78, notes: 'Customer requested a statement of account.' },
    { status: 'PAID', issuedDaysAgo: 14, paidDaysAgo: 3 },
    { status: 'PAID', issuedDaysAgo: 40, paidDaysAgo: 20 },
    { status: 'PAID', issuedDaysAgo: 65, paidDaysAgo: 33 },
    { status: 'CANCELLED', issuedDaysAgo: 21, notes: 'Cancelled — order re-invoiced.' },
    { status: 'REFUNDED', issuedDaysAgo: 30, refundShare: 1, notes: 'Full refund after return.' },
]

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)
const dec = (value: Prisma.Decimal | null | undefined) => new Prisma.Decimal(value ?? 0)

async function clean() {
    const { count } = await prisma.sdSalesInvoice.deleteMany({
        where: { invoiceNumber: { startsWith: NUMBER_PREFIX }, createdBy: TAG },
    })
    console.log(`Removed ${count} demo invoice(s).`)
}

async function seed() {
    const orders = await prisma.sdSalesOrder.findMany({
        where: {
            status: { in: SHIPPED_STATUSES },
            invoices: { none: {} },
            lines: { some: {} },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: CASES.length,
    })
    if (orders.length === 0) {
        console.log('No shipped orders without an invoice; nothing to seed.')
        return
    }
    const fallbackCompany = await prisma.company.findFirst({ select: { id: true } })

    for (const [index, order] of orders.entries()) {
        const demo = CASES[index]
        const lines = order.lines.map((line) => {
            const quantity = dec(line.quantity)
            const unitPrice = dec(line.unitPrice)
            return {
                lineNumber: line.lineNumber,
                salesOrderLineId: line.id,
                sku: line.variantSku ?? line.sku ?? line.productSkuSnapshot ?? 'N/A',
                description: line.productNameSnapshot ?? line.description,
                variantName: line.variantName,
                quantity,
                unitPrice,
                lineTotal: line.lineTotal ?? unitPrice.times(quantity),
            }
        })
        const subtotal =
            order.subtotal ?? lines.reduce((sum, l) => sum.plus(l.lineTotal), new Prisma.Decimal(0))
        const total =
            order.totalAmount ??
            subtotal.minus(order.discountAmount).plus(order.shippingAmount)
        const number = `${NUMBER_PREFIX}${String(index + 1).padStart(4, '0')}`

        await prisma.sdSalesInvoice.create({
            data: {
                invoiceNumber: number,
                companyId: order.companyId ?? fallbackCompany?.id ?? 'DEMO',
                salesOrderId: order.id,
                status: demo.status,
                currency: order.currency,
                subtotal,
                discountAmount: order.discountAmount,
                shippingAmount: order.shippingAmount,
                totalAmount: total,
                refundedAmount: total.times(demo.refundShare ?? 0).toDecimalPlaces(2),
                issuedAt: daysAgo(demo.issuedDaysAgo),
                paidAt: demo.paidDaysAgo !== undefined ? daysAgo(demo.paidDaysAgo) : null,
                cancelledAt: demo.status === 'CANCELLED' ? daysAgo(demo.issuedDaysAgo - 1) : null,
                notes: demo.notes ?? null,
                createdBy: TAG,
                lines: { create: lines },
            },
        })
        console.log(`${number} → ${order.orderNumber} (${demo.status}, issued ${demo.issuedDaysAgo}d ago)`)
    }
    if (orders.length < CASES.length) {
        console.log(`Only ${orders.length} eligible order(s); some demo cases were skipped.`)
    }
}

async function main() {
    await clean()
    if (!process.argv.includes('--clean')) await seed()
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
