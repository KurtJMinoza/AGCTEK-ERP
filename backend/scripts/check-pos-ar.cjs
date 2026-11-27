const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
    const orderNumber = process.argv[2] || 'POS-000003'
    const order = await p.sdSalesOrder.findFirst({
        where: { orderNumber },
        select: {
            id: true,
            orderNumber: true,
            paymentStatus: true,
            paymentMethod: true,
            outstandingBalance: true,
            totalAmount: true,
            status: true,
            customerId: true,
        },
    })
    console.log('order', order)
    if (!order) return
    const ar = await p.ficoArOpenItem.findMany({
        where: {
            customerId: order.customerId,
            document: { sourceSalesOrderId: order.id },
        },
        include: {
            document: { select: { referenceNumber: true, journalEntryId: true } },
        },
    })
    console.log(
        'ar',
        ar.map((i) => ({
            id: i.id,
            status: i.status,
            openAmount: i.openAmount.toString(),
            originalAmount: i.originalAmount.toString(),
            dueDate: i.dueDate,
            ref: i.document?.referenceNumber,
        })),
    )
    const collections = await p.sdPosCollection.findMany({
        where: { salesOrderId: order.id },
        orderBy: { createdAt: 'asc' },
    })
    console.log(
        'sdPosCollections',
        collections.map((c) => ({
            id: c.id,
            collectionNumber: c.collectionNumber,
            totalAmount: c.totalAmount.toString(),
        })),
    )
    const events = await p.mmAccountingEvent.findMany({
        where: {
            OR: [
                { documentId: order.id },
                { idempotencyKey: { contains: order.id } },
                ...collections.map((c) => ({ documentId: c.id })),
            ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
            eventType: true,
            status: true,
            idempotencyKey: true,
            journalEntryId: true,
            payload: true,
        },
    })
    for (const e of events) {
        const pl = e.payload || {}
        console.log('event', {
            eventType: e.eventType,
            status: e.status,
            idempotencyKey: e.idempotencyKey,
            journalEntryId: e.journalEntryId,
            outstandingBalance: pl.outstandingBalance,
            paymentStatus: pl.paymentStatus,
            tenders: pl.tenders?.length,
        })
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())