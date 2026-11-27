/**
 * Hard-delete POS/SO orders + linked FICO journals, MM GIs, and inventory ledger rows.
 *
 *   node scripts/purge-pos-orders-fico-mm-trail.cjs POS-000001 POS-000002 SO-000001
 */
const { PrismaClient } = require('@prisma/client')

const orderNumbers = process.argv.slice(2)
if (!orderNumbers.length) {
    console.error('Usage: node scripts/purge-pos-orders-fico-mm-trail.cjs <orderNumber> [...]')
    process.exit(1)
}

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
    if (!rootTxnIds.length) return 0
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
    const del = await prisma.mmInventoryTransaction.deleteMany({
        where: { OR: [{ id: { in: ids } }, { reversalOfId: { in: ids } }] },
    })
    return del.count
}

async function collectJournalIds(prisma, orderIds, giIds) {
    const found = new Set()
    let expanded = true
    while (expanded) {
        expanded = false
        const or = [
            ...(orderIds.length
                ? [{ sourceDocumentId: { in: orderIds } }]
                : []),
            ...(giIds.length ? [{ sourceDocumentId: { in: giIds } }] : []),
            ...orderIds.map((id) => ({
                idempotencyKey: { startsWith: `pos-revenue:${id}` },
            })),
            ...orderIds.map((id) => ({
                idempotencyKey: { startsWith: `void:${id}` },
            })),
            ...orderIds.map((id) => ({
                idempotencyKey: { startsWith: `pos-void:${id}` },
            })),
            ...giIds.map((id) => ({
                idempotencyKey: { contains: id },
            })),
        ]
        if (found.size) {
            or.push({ reversalOfId: { in: [...found] } })
            or.push({ id: { in: [...found] } })
        }
        const rows = await prisma.ficoJournalEntry.findMany({
            where: { OR: or },
            select: { id: true, reversalOfId: true, documentNumber: true },
        })
        for (const r of rows) {
            if (!found.has(r.id)) {
                found.add(r.id)
                expanded = true
            }
            if (r.reversalOfId && !found.has(r.reversalOfId)) {
                found.add(r.reversalOfId)
                expanded = true
            }
        }
    }
    const docs = await prisma.ficoJournalEntry.findMany({
        where: { id: { in: [...found] } },
        select: { documentNumber: true },
    })
    return { ids: [...found], numbers: docs.map((d) => d.documentNumber) }
}

async function deleteOrderTree(tx, orderIds) {
    for (const orderId of orderIds) {
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
        await tx.sdSalesInvoiceLine.deleteMany({
            where: { invoice: { salesOrderId: orderId } },
        })
        await tx.sdSalesInvoice.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdShipment.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdSalesReturnLine.deleteMany({
            where: { salesReturn: { salesOrderId: orderId } },
        })
        await tx.sdSalesReturn.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdReturnRequestLine.deleteMany({
            where: { returnRequest: { salesOrderId: orderId } },
        })
        await tx.sdReturnRequest.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdPosVoidTransaction.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdPosCollection.deleteMany({ where: { salesOrderId: orderId } })
        await tx.sdPosReceivable.deleteMany({ where: { salesOrderId: orderId } })
        await tx.ficoArDocument.deleteMany({
            where: { sourceSalesOrderId: orderId },
        })
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
    }
    await tx.sdSalesOrder.deleteMany({ where: { id: { in: orderIds } } })
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const orders = await prisma.sdSalesOrder.findMany({
            where: { orderNumber: { in: orderNumbers } },
            select: { id: true, orderNumber: true },
        })
        const orderIds = orders.map((o) => o.id)
        console.log(
            'Orders:',
            orders.map((o) => o.orderNumber).join(', ') || '(none)',
        )
        if (!orderIds.length) {
            console.log('No matching sales orders — journals-only cleanup skipped for orders.')
        }

        const headers = orderIds.length
            ? await prisma.mmInventoryReservationHeader.findMany({
                  where: { sourceDocumentId: { in: orderIds } },
                  select: { id: true },
              })
            : []
        const headerIds = headers.map((h) => h.id)

        const gis = orderIds.length
            ? await prisma.mmGoodsIssue.findMany({
                  where: {
                      OR: [
                          { sourceDocumentId: { in: orderIds } },
                          ...(headerIds.length
                              ? [{ reservationHeaderId: { in: headerIds } }]
                              : []),
                      ],
                  },
                  select: { id: true, documentNumber: true },
              })
            : []
        const giIds = gis.map((g) => g.id)
        console.log('Goods issues:', gis.map((g) => g.documentNumber).join(', ') || '(none)')

        const { ids: journalIds, numbers: journalNumbers } =
            await collectJournalIds(prisma, orderIds, giIds)
        console.log(
            'Journals to delete:',
            journalNumbers.sort().join(', ') || '(none)',
        )

        if (journalIds.length) {
            await prisma.$transaction(async (tx) => {
                await disableFicoImmutabilityTriggers(tx)
                await tx.ficoReconciliationCase.deleteMany({
                    where: { journalEntryId: { in: journalIds } },
                })
                await tx.ficoAccountingAuditLog.deleteMany({
                    where: {
                        entityType: 'FicoJournalEntry',
                        entityId: { in: journalIds },
                    },
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
                const je = await tx.ficoJournalEntry.deleteMany({
                    where: { id: { in: journalIds } },
                })
                console.log(`Deleted ${je.count} journal(s).`)
                await enableFicoImmutabilityTriggers(tx)
            })
        }

        const eventOr = []
        for (const id of orderIds) {
            eventOr.push({ documentId: id })
            eventOr.push({ idempotencyKey: { startsWith: `pos-revenue:${id}` } })
            eventOr.push({ idempotencyKey: { startsWith: `void:${id}` } })
            eventOr.push({ idempotencyKey: { startsWith: `pos-void:${id}` } })
        }
        for (const id of giIds) {
            eventOr.push({ documentId: id, documentType: 'GOODS_ISSUE' })
            eventOr.push({ idempotencyKey: { contains: id } })
        }
        if (eventOr.length) {
            const ev = await prisma.mmAccountingEvent.deleteMany({ where: { OR: eventOr } })
            console.log(`Deleted ${ev.count} mm accounting event(s).`)
        }

        let txnCount = 0
        for (const giId of giIds) {
            const inv = await prisma.mmInventoryTransaction.findMany({
                where: {
                    sourceDocumentType: 'GOODS_ISSUE',
                    sourceDocumentId: giId,
                },
                select: { id: true },
            })
            txnCount += await purgeInventoryTransactions(
                prisma,
                inv.map((t) => t.id),
            )
        }
        console.log(`Purged ${txnCount} inventory transaction row(s).`)

        if (giIds.length || headerIds.length) {
            await prisma.$transaction(async (tx) => {
                await tx.shipment
                    .updateMany({
                        where: { goodsIssueId: { in: giIds } },
                        data: { goodsIssueId: null },
                    })
                    .catch(() => undefined)
                await tx.sdShipment.updateMany({
                    where: { goodsIssueId: { in: giIds } },
                    data: { goodsIssueId: null },
                })
                await tx.mmGoodsIssue.updateMany({
                    where: { id: { in: giIds } },
                    data: {
                        reservationHeaderId: null,
                        reservationId: null,
                        packageId: null,
                    },
                })
                await tx.mmGoodsIssueLine.deleteMany({ where: { issueId: { in: giIds } } })
                await tx.mmGoodsIssue.deleteMany({ where: { id: { in: giIds } } })

                if (headerIds.length) {
                    await tx.mmInventoryAllocationLine.deleteMany({
                        where: { allocation: { headerId: { in: headerIds } } },
                    }).catch(() => undefined)
                    await tx.mmInventoryAllocation.deleteMany({
                        where: { headerId: { in: headerIds } },
                    }).catch(() => undefined)
                    await tx.mmInventoryReservation.deleteMany({
                        where: { reservationHeaderId: { in: headerIds } },
                    })
                    await tx.mmInventoryReservationLine.deleteMany({
                        where: { headerId: { in: headerIds } },
                    })
                    await tx.mmInventoryReservationHeader.deleteMany({
                        where: { id: { in: headerIds } },
                    })
                }
            })
            console.log(`Removed ${giIds.length} GI(s) and ${headerIds.length} reservation header(s).`)
        }

        if (orderIds.length) {
            await prisma.$transaction(async (tx) => {
                await deleteOrderTree(tx, orderIds)
            })
            console.log(`Deleted ${orderIds.length} sales order(s).`)
        }

        const verify = {
            orders: await prisma.sdSalesOrder.count({
                where: { orderNumber: { in: orderNumbers } },
            }),
            journals: journalNumbers.length
                ? await prisma.ficoJournalEntry.count({
                      where: { documentNumber: { in: journalNumbers } },
                  })
                : 0,
            gis: giIds.length
                ? await prisma.mmGoodsIssue.count({ where: { id: { in: giIds } } })
                : 0,
        }
        console.log('Remaining (should be 0):', verify)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})