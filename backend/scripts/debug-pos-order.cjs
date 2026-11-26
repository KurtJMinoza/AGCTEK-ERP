const { PrismaClient } = require('@prisma/client')

const orderNumber = process.argv[2] || 'POS-000003'

async function main() {
    const p = new PrismaClient()
    try {
        const o = await p.sdSalesOrder.findFirst({
            where: { orderNumber },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                voidedAt: true,
                voidReason: true,
                companyId: true,
            },
        })
        console.log('order', o)
        if (!o) return
        const key = `pos-revenue:${o.id}`
        const voidKey = `void:${o.id}`
        const events = await p.mmAccountingEvent.findMany({
            where: {
                OR: [
                    { idempotencyKey: key },
                    { idempotencyKey: voidKey },
                    { documentId: o.id },
                ],
            },
            select: {
                id: true,
                eventType: true,
                status: true,
                lastError: true,
                idempotencyKey: true,
            },
        })
        console.log('events', events)
        const journals = await p.ficoJournalEntry.findMany({
            where: {
                OR: [
                    { idempotencyKey: key },
                    { idempotencyKey: voidKey },
                    { sourceDocumentId: o.id },
                    { sourcePostingKey: key },
                ],
            },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                idempotencyKey: true,
                reversalOfId: true,
            },
        })
        console.log('journals', journals)
    } finally {
        await p.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})