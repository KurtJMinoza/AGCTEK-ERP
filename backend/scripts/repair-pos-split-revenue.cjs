/**
 * Reverse and repost POS revenue after split-tender / revenue classification fixes.
 *
 *   node scripts/repair-pos-split-revenue.cjs POS-000001
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { PrismaClient, Decimal } = require('@prisma/client')

const orderNumber = process.argv[2] ?? 'POS-000001'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    const prisma = new PrismaClient()
    const bridge =
        app.get(require('../dist/fico/fico-sd-accounting-bridge.service')
            .FicoSdAccountingBridgeService)
    const processor = app.get(
        require('../dist/fico/fico-accounting-event-processor.service')
            .FicoAccountingEventProcessorService,
    )
    try {
        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber, channel: 'POS' },
            include: {
                payments: true,
            },
        })
        if (!order) {
            console.log('Order not found')
            return
        }
        const posted = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId: order.companyId,
                status: 'POSTED',
                OR: [
                    { idempotencyKey: { startsWith: `pos-revenue:${order.id}` } },
                    { sourceDocumentId: order.id, documentType: 'SD_REVENUE' },
                ],
            },
            select: { documentNumber: true },
        })
        console.log('Posted revenue journals:', posted.map((j) => j.documentNumber))

        await bridge.reversePosRevenueJournal(
            order.companyId,
            order.id,
            'Repost after split-tender and revenue classification fix',
            `pos-void:${order.id}:split-tender-repair`,
        )

        await new Promise((r) => setTimeout(r, 800))
        let pending = await prisma.mmAccountingEvent.findMany({
            where: {
                eventType: 'PosSaleVoided',
                documentId: order.id,
                status: { in: ['PENDING', 'FAILED'] },
            },
        })
        for (const ev of pending) {
            await processor.retryEvent(ev.id)
        }

        const tenders = order.payments
            .filter((p) => !['Cancelled', 'Refunded'].includes(p.status))
            .map((p) => ({
                method: p.paymentMethod,
                amount: p.amount.toString(),
                status: p.status,
            }))

        await bridge.recordAndDispatch({
            eventType: 'PosSaleCompleted',
            documentType: 'SALES_ORDER',
            documentId: order.id,
            companyId: order.companyId,
            postingDate: new Date(),
            currencyCode: order.currency ?? 'PHP',
            idempotencyKey: `pos-revenue:${order.id}:split-tender-repair-v3`,
            totalValue: new Decimal(order.totalAmount.toString()),
            payload: {
                salesOrderId: order.id,
                orderNumber: order.orderNumber,
                branchId: order.branchId,
                customerId: order.customerId ?? undefined,
                totalAmount: order.totalAmount.toString(),
                taxAmount: (order.taxAmount ?? 0).toString(),
                outstandingBalance: '0',
                paymentStatus: order.paymentStatus ?? 'Paid',
                tenders,
            },
        })

        await new Promise((r) => setTimeout(r, 800))
        pending = await prisma.mmAccountingEvent.findMany({
            where: {
                idempotencyKey: `pos-revenue:${order.id}:split-tender-repair-v3`,
                status: { in: ['PENDING', 'FAILED'] },
            },
        })
        for (const ev of pending) {
            await processor.retryEvent(ev.id)
        }

        const after = await prisma.ficoJournalEntry.findMany({
            where: {
                companyId: order.companyId,
                OR: [
                    { idempotencyKey: { startsWith: `pos-revenue:${order.id}` } },
                    { sourceDocumentId: order.id, documentType: 'SD_REVENUE' },
                ],
            },
            include: {
                lines: {
                    include: { glAccount: { select: { accountCode: true } } },
                    orderBy: { lineNumber: 'asc' },
                },
            },
            orderBy: { createdAt: 'asc' },
        })
        for (const j of after) {
            console.log(
                `${j.documentNumber} ${j.status}:`,
                j.lines
                    .map(
                        (l) =>
                            `${Number(l.debitAmount) > 0 ? 'DR' : 'CR'} ${l.glAccount.accountCode} ${Number(l.debitAmount) || Number(l.creditAmount)}`,
                    )
                    .join(' | '),
            )
        }
    } finally {
        await app.close()
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})