const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const orderNumber = process.argv[2] || 'POS-000003'
;(async () => {
    const order = await p.sdSalesOrder.findFirst({
        where: { orderNumber },
        select: { id: true },
    })
    if (!order) return
    const events = await p.mmAccountingEvent.findMany({
        where: { documentId: order.id, eventType: 'PosSaleCompleted' },
        select: { journalEntryId: true },
    })
    const col = await p.sdPosCollection.findFirst({
        where: { salesOrderId: order.id },
        select: { id: true },
    })
    const colEvent = col
        ? await p.mmAccountingEvent.findFirst({
              where: { documentId: col.id, eventType: 'PosCollectionCompleted' },
              select: { journalEntryId: true },
          })
        : null
    const ids = [
        ...events.map((e) => e.journalEntryId).filter(Boolean),
        colEvent?.journalEntryId,
    ].filter(Boolean)
    const journals = await p.ficoJournalEntry.findMany({
        where: { id: { in: ids } },
        select: { documentNumber: true, documentType: true, description: true },
    })
    console.log(journals)
})()
    .finally(() => p.$disconnect())