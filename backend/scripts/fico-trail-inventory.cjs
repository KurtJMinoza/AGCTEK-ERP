const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function posTrail(orderNumber) {
    const order = await p.sdSalesOrder.findFirst({
        where: { orderNumber },
        select: { id: true, orderNumber: true, customerId: true },
    })
    if (!order) return null
    const events = await p.mmAccountingEvent.findMany({
        where: {
            OR: [
                { documentId: order.id },
                { idempotencyKey: { contains: order.id } },
            ],
        },
        select: {
            eventType: true,
            idempotencyKey: true,
            status: true,
            journalEntryId: true,
        },
    })
    const ar = await p.ficoArOpenItem.findMany({
        where: { document: { sourceSalesOrderId: order.id } },
        select: { status: true, openAmount: true, id: true },
    })
    const arDocs = await p.ficoArDocument.findMany({
        where: { sourceSalesOrderId: order.id },
        select: { id: true, referenceNumber: true, journalEntryId: true },
    })
    const journalIds = new Set(
        [
            ...events.map((e) => e.journalEntryId),
            ...arDocs.map((d) => d.journalEntryId),
        ].filter(Boolean),
    )
    const journals = await p.ficoJournalEntry.findMany({
        where: {
            OR: [
                { id: { in: [...journalIds] } },
                { description: { contains: orderNumber } },
            ],
        },
        select: { documentNumber: true, documentType: true, id: true },
    })
    return { order, events, ar, arDocs, journals }
}

async function main() {
    const customer = await p.sdCustomer.findFirst({
        where: { customerNumber: 'WALK-000001' },
        select: { id: true, customerNumber: true, companyName: true },
    })
    console.log('Customer:', customer)
    if (customer) {
        const arOpen = await p.ficoArOpenItem.count({
            where: { customerId: customer.id },
        })
        const arAll = await p.ficoArDocument.count({
            where: { customerId: customer.id },
        })
        console.log('AR open items:', arOpen, 'AR documents:', arAll)
    }
    if (customer) {
        const posOrders = await p.sdSalesOrder.findMany({
            where: { customerId: customer.id, channel: 'POS' },
            select: { orderNumber: true, paymentStatus: true },
            orderBy: { orderNumber: 'asc' },
        })
        console.log('POS for customer:', posOrders)
        const arItems = await p.ficoArOpenItem.findMany({
            where: { customerId: customer.id },
            include: { document: { select: { referenceNumber: true } } },
        })
        console.log(
            'All AR open items:',
            arItems.map((i) => ({
                ref: i.document?.referenceNumber,
                status: i.status,
                open: i.openAmount.toString(),
            })),
        )
    }
    for (const on of ['POS-000001', 'POS-000002', 'POS-000003', 'POS-000004', 'POS-000005']) {
        const t = await posTrail(on)
        if (t) console.log('\n' + on, JSON.stringify(t, null, 2))
    }
    const p2p = await p.mmAccountingEvent.findMany({
        where: { payload: { path: ['deliveryTerms'], equals: 'seed-p2p-demo-v1' } },
        take: 1,
    })
    if (!p2p.length) {
        const po = await p.purchaseOrder.findFirst({
            where: { documentNumber: 'PO-20261126-00001' },
            select: { id: true, documentNumber: true },
        })
        if (po) {
            const ap = await p.ficoApOpenItem.findMany({
                where: { document: { purchaseOrderId: po.id } },
                take: 5,
                select: { openAmount: true, status: true },
            })
            console.log('\nP2P PO', po, 'AP items', ap)
        }
    }
}

main().finally(() => p.$disconnect())