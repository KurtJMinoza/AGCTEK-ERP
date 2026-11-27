const { PrismaClient } = require('@prisma/client')

async function main() {
    const p = new PrismaClient()
    try {
        const po = await p.mmPurchaseOrder.findFirst({
            where: { deliveryTerms: 'seed-p2p-demo-v1' },
        })
        const gr = await p.mmGoodsReceipt.findFirst({
            where: { purchaseOrderId: po?.id },
        })
        if (!po || !gr) {
            console.log('No P2P demo docs')
            return
        }
        const events = await p.mmAccountingEvent.findMany({
            where: { documentId: { in: [gr.id, po.id] } },
            select: { eventType: true, status: true, journalEntryId: true },
        })
        const journals = await p.ficoJournalEntry.findMany({
            where: { sourceDocumentId: gr.id },
            select: { documentNumber: true, status: true, documentType: true },
        })
        const lines = await p.ficoJournalEntryLine.findMany({
            where: { journalEntry: { sourceDocumentId: gr.id } },
            select: {
                debitAmount: true,
                creditAmount: true,
                glAccount: { select: { accountCode: true, accountName: true } },
            },
        })
        const grir = await p.ficoGrIrOpenItem.findMany({
            where: { goodsReceiptId: gr.id },
            select: { id: true, outstandingAmount: true, reconciliationStatus: true },
        })
        console.log({
            po: po.poNumber,
            gr: gr.documentNumber,
            grAccounting: gr.accountingPostingStatus,
            events,
            journals,
            journalLines: lines,
            grirOpenItems: grir,
        })
    } finally {
        await p.$disconnect()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})