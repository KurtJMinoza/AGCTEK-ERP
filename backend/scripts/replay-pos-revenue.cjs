/**
 * Re-post POS revenue journals for completed POS orders missing pos-revenue:* journals.
 *
 *   node scripts/replay-pos-revenue.cjs [ORDER_NUMBER]
 *   node scripts/replay-pos-revenue.cjs POS-000003
 */
const { NestFactory } = require('@nestjs/core')

async function main() {
    const orderNumber = process.argv[2]
    if (!orderNumber) {
        console.error('Usage: node scripts/replay-pos-revenue.cjs ORDER_NUMBER')
        process.exit(1)
    }

    // Compiled AppModule (run from backend/ after build, or via ts-node on dist)
    const { AppModule } = require('../dist/app.module')
    const { PrismaService } = require('../dist/prisma/prisma.service')
    const { FicoSdAccountingBridgeService } = require('../dist/fico/fico-sd-accounting-bridge.service')
    const { FicoAccountingEventProcessorService } = require(
        '../dist/fico/fico-accounting-event-processor.service',
    )

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
  try {
        const prisma = app.get(PrismaService)
        const bridge = app.get(FicoSdAccountingBridgeService)
        const processor = app.get(FicoAccountingEventProcessorService)

        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber, channel: 'POS' },
            include: { payments: true, lines: { select: { taxAmount: true } } },
        })
        if (!order) {
            console.log(`Order ${orderNumber} not found.`)
            return
        }
        if (order.status !== 'COMPLETED') {
            console.log(`Order ${orderNumber} is ${order.status}; only COMPLETED orders are replayed.`)
            return
        }

        const idempotencyKey = `pos-revenue:${order.id}`
        const existing = await prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey },
        })
        if (existing) {
            console.log(`Journal already exists: ${existing.documentNumber} (${existing.status})`)
            return
        }

        let event = await prisma.mmAccountingEvent.findUnique({
            where: { idempotencyKey },
        })
        if (event?.status === 'CONSUMED') {
            console.log('Accounting event already consumed; check journal by idempotency key.')
            return
        }

        const taxAmount = order.lines.reduce(
            (sum, line) => sum + Number(line.taxAmount ?? 0),
            0,
        )

        const tenders = (order.payments ?? []).map((p) => ({
            method: p.paymentMethod,
            amount: String(p.amount ?? 0),
            status: p.status ?? undefined,
            verificationStatus: p.verificationStatus ?? undefined,
            referenceNumber: p.referenceNumber ?? undefined,
        }))

        if (!event) {
            await bridge.recordAndDispatch({
                eventType: 'PosSaleCompleted',
                documentType: 'SALES_ORDER',
                documentId: order.id,
                companyId: order.companyId,
                postingDate: order.updatedAt ?? new Date(),
                currencyCode: order.currency ?? 'PHP',
                idempotencyKey,
                totalValue: order.totalAmount,
                payload: {
                    salesOrderId: order.id,
                    orderNumber: order.orderNumber,
                    receiptNumber: order.receiptNumber ?? undefined,
                    tenders,
                    outstandingBalance: String(order.outstandingBalance ?? 0),
                    totalAmount: String(order.totalAmount ?? 0),
                    taxAmount: taxAmount.toFixed(2),
                },
            })
            event = await prisma.mmAccountingEvent.findUnique({
                where: { idempotencyKey },
            })
        }

        if (event && event.status !== 'CONSUMED') {
            if (event.status === 'PROCESSING') {
                await prisma.mmAccountingEvent.update({
                    where: { id: event.id },
                    data: { status: 'PENDING', processingStartedAt: null },
                })
            }
            const payload = { ...event.payload, mmAccountingEventId: event.id, idempotencyKey }
            await processor.processDispatch(payload)
            const failed = await prisma.mmAccountingEvent.findUnique({
                where: { id: event.id },
                select: { lastError: true, status: true },
            })
            if (failed?.status === 'FAILED') {
                console.error('Posting failed:', failed.lastError)
            }
        }

        const journal = await prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey },
            select: { documentNumber: true, status: true },
        })
        console.log('Replay done:', journal ?? 'no journal (check mm_accounting_events.lastError)')
    } finally {
        await app.close()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})