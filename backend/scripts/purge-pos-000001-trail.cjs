/**
 * Dev-only: remove POS-000001 POS/SR journals, MM goods issue trail, and order.
 */
const { PrismaClient } = require('@prisma/client')

const ORDER_ID = 'cmwvsnejy00qtosj4s4ptrs5l'
const ORDER_NUMBER = 'POS-000001'
const GI_ID = 'cmwvsneoy00rkosj4k9w3fhh2'
const RESERVATION_ID = 'cmwvsnemx00r7osj4dpmft94e'
const JOURNAL_DOCS = ['PS-2026-000005', 'SR-2026-000004']

async function disableFicoImmutabilityTriggers(tx) {
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entry_lines" DISABLE TRIGGER "fico_journal_entry_lines_immutable"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entries" DISABLE TRIGGER "fico_journal_entries_immutable"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_accounting_audit_logs" DISABLE TRIGGER "fico_accounting_audit_logs_append_only"`,
    )
}

async function enableFicoImmutabilityTriggers(tx) {
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_accounting_audit_logs" ENABLE TRIGGER "fico_accounting_audit_logs_append_only"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entries" ENABLE TRIGGER "fico_journal_entries_immutable"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entry_lines" ENABLE TRIGGER "fico_journal_entry_lines_immutable"`,
    )
}

async function purgeInventoryTransactions(prisma, rootTxnIds) {
    if (!rootTxnIds.length) return
    const allIds = new Set(rootTxnIds)
    for (const id of rootTxnIds) {
        const reversals = await prisma.mmInventoryTransaction.findMany({
            where: { reversalOfId: id },
            select: { id: true },
        })
        for (const r of reversals) allIds.add(r.id)
    }
    const ids = [...allIds]
    const valTxns = await prisma.mmInventoryValuationTransaction.findMany({
        where: { inventoryTxnId: { in: ids } },
        select: { id: true },
    })
    const valIds = valTxns.map((v) => v.id)
    if (valIds.length) {
        await prisma.mmInventoryValuationTransaction.deleteMany({
            where: { OR: [{ id: { in: valIds } }, { reversalOfId: { in: valIds } }] },
        })
    }
    await prisma.mmCostLayer.deleteMany({ where: { receiptTxnId: { in: ids } } })
    await prisma.mmInventoryAudit.deleteMany({ where: { transactionId: { in: ids } } })
    await prisma.mmInventoryTransaction.deleteMany({
        where: { OR: [{ id: { in: ids } }, { reversalOfId: { in: ids } }] },
    })
}

async function deleteOrderTree(tx, orderId) {
    const lineIds = (
        await tx.sdSalesOrderLine.findMany({
            where: { salesOrderId: orderId },
            select: { id: true },
        })
    ).map((l) => l.id)
    if (lineIds.length) {
        await tx.sdSalesOrderLine.updateMany({
            where: { id: { in: lineIds } },
            data: { reservationHeaderId: null },
        })
    }
    await tx.sdSalesInvoice.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdShipment.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdSalesReturn.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdReturnRequest.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdPosVoidTransaction.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdPosCollection.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdPosReceivable.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdEmployeeLoanItem.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdSalesOrderPayment.deleteMany({ where: { salesOrderId: orderId } })
    await tx.productReview.deleteMany({ where: { salesOrderId: orderId } })
    const fulfillmentIds = (
        await tx.sdFulfillment.findMany({
            where: { salesOrderId: orderId },
            select: { id: true },
        })
    ).map((f) => f.id)
    if (fulfillmentIds.length) {
        await tx.sdFulfillmentLine.deleteMany({
            where: { fulfillmentId: { in: fulfillmentIds } },
        })
    }
    await tx.sdFulfillment.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdSalesOrderLine.deleteMany({ where: { salesOrderId: orderId } })
    await tx.sdSalesOrder.deleteMany({ where: { id: orderId } })
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const journals = await prisma.ficoJournalEntry.findMany({
            where: { documentNumber: { in: JOURNAL_DOCS } },
            select: { id: true, reversalOfId: true, mmAccountingEventId: true },
        })
        const journalIds = journals.map((j) => j.id)
        const eventKeys = [`pos-revenue:${ORDER_ID}`, `void:${ORDER_ID}`]

        await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)

            await tx.ficoReconciliationCase.deleteMany({
                where: { journalEntryId: { in: journalIds } },
            })
            await tx.ficoAccountingAuditLog.deleteMany({
                where: { entityType: 'FicoJournalEntry', entityId: { in: journalIds } },
            })
            await tx.ficoJournalEntry.updateMany({
                where: { reversalOfId: { in: journalIds } },
                data: { reversalOfId: null },
            })
            await tx.ficoJournalEntry.updateMany({
                where: { id: { in: journalIds } },
                data: { reversalOfId: null, mmAccountingEventId: null },
            })
            await tx.ficoJournalEntryLine.deleteMany({
                where: { journalEntryId: { in: journalIds } },
            })
            await tx.ficoJournalEntry.deleteMany({ where: { id: { in: journalIds } } })

            await tx.mmAccountingEvent.deleteMany({
                where: {
                    OR: [
                        { idempotencyKey: { in: eventKeys } },
                        { documentId: ORDER_ID },
                        { documentId: GI_ID, documentType: 'GOODS_ISSUE' },
                    ],
                },
            })

            await enableFicoImmutabilityTriggers(tx)
        })

        const inv = await prisma.mmInventoryTransaction.findMany({
            where: { sourceDocumentType: 'GOODS_ISSUE', sourceDocumentId: GI_ID },
            select: { id: true },
        })
        await purgeInventoryTransactions(
            prisma,
            inv.map((t) => t.id),
        )

        await prisma.$transaction(async (tx) => {
            await tx.sdShipment.updateMany({
                where: { goodsIssueId: GI_ID },
                data: { goodsIssueId: null },
            })
            await tx.mmGoodsIssue.updateMany({
                where: { id: GI_ID },
                data: { reservationHeaderId: null, reservationId: null, packageId: null },
            })
            await tx.mmGoodsIssueLine.deleteMany({ where: { issueId: GI_ID } })
            await tx.mmGoodsIssue.deleteMany({ where: { id: GI_ID } })
            await tx.mmInventoryReservationLine.deleteMany({
                where: { headerId: RESERVATION_ID },
            })
            await tx.mmInventoryReservationHeader.deleteMany({
                where: { id: RESERVATION_ID },
            })
            await deleteOrderTree(tx, ORDER_ID)
        })

        const left = {
            journals: await prisma.ficoJournalEntry.count({
                where: { documentNumber: { in: JOURNAL_DOCS } },
            }),
            order: await prisma.sdSalesOrder.count({ where: { id: ORDER_ID } }),
            gi: await prisma.mmGoodsIssue.count({ where: { id: GI_ID } }),
            events: await prisma.mmAccountingEvent.count({
                where: {
                    OR: [
                        { idempotencyKey: { in: eventKeys } },
                        { documentId: GI_ID },
                    ],
                },
            }),
        }
        console.log('Purged POS-000001 trail. Remaining:', left)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})