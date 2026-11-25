/**
 * Hard-delete MC-2026-XLSX-* POS Fast-Track orders (+ FICO bridge if present).
 *
 *   node scripts/purge-mc-xlsx-orders.cjs
 *   node scripts/purge-mc-xlsx-orders.cjs --dry-run
 *   node scripts/purge-mc-xlsx-orders.cjs MC-2026-XLSX-01226 MC-2026-XLSX-01235
 */
const { PrismaClient } = require('@prisma/client')

const DEFAULT_ORDERS = [
    'MC-2026-XLSX-01226',
    'MC-2026-XLSX-01227',
    'MC-2026-XLSX-01228',
    'MC-2026-XLSX-01229',
    'MC-2026-XLSX-01230',
    'MC-2026-XLSX-01231',
    'MC-2026-XLSX-01232',
    'MC-2026-XLSX-01233',
    'MC-2026-XLSX-01234',
    'MC-2026-XLSX-01235',
]

const dryRun = process.argv.includes('--dry-run')
const orderArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const ORDER_NUMBERS =
    orderArgs.length > 0 ? orderArgs : DEFAULT_ORDERS

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

async function purgeFicoForOrder(tx, orderId) {
    const keys = [`pos-revenue:${orderId}`, `void:${orderId}`]
    const events = await tx.mmAccountingEvent.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { id: true, idempotencyKey: true },
    })
    const journalIds = new Set()
    for (const key of keys) {
        const j = await tx.ficoJournalEntry.findFirst({
            where: {
                OR: [{ sourcePostingKey: key }, { idempotencyKey: key }],
            },
            select: { id: true, reversalOfId: true, documentNumber: true },
        })
        if (j) journalIds.add(j.id)
        if (j?.reversalOfId) journalIds.add(j.reversalOfId)
    }
    for (const ev of events) {
        const linked = await tx.ficoJournalEntry.findFirst({
            where: { mmAccountingEventId: ev.id },
            select: { id: true, reversalOfId: true, documentNumber: true },
        })
        if (linked) {
            journalIds.add(linked.id)
            if (linked.reversalOfId) journalIds.add(linked.reversalOfId)
        }
    }
    const ids = [...journalIds]
    if (!ids.length && !events.length) return { journals: [], events: [] }

    await tx.ficoReconciliationCase.deleteMany({
        where: {
            OR: [
                { journalEntryId: { in: ids } },
                { mmAccountingEventId: { in: events.map((e) => e.id) } },
            ],
        },
    })
    await tx.ficoAccountingAuditLog.deleteMany({
        where: { entityType: 'FicoJournalEntry', entityId: { in: ids } },
    })
    await tx.ficoJournalEntry.updateMany({
        where: { reversalOfId: { in: ids } },
        data: { reversalOfId: null },
    })
    await tx.ficoJournalEntry.updateMany({
        where: { id: { in: ids } },
        data: { reversalOfId: null, mmAccountingEventId: null },
    })
    await tx.mmAccountingEvent.updateMany({
        where: { journalEntryId: { in: ids } },
        data: { journalEntryId: null },
    })
    const docNums = []
    if (ids.length) {
        const heads = await tx.ficoJournalEntry.findMany({
            where: { id: { in: ids } },
            select: { documentNumber: true },
        })
        docNums.push(...heads.map((h) => h.documentNumber).filter(Boolean))
        await tx.ficoJournalEntryLine.deleteMany({
            where: { journalEntryId: { in: ids } },
        })
        await tx.ficoJournalEntry.deleteMany({ where: { id: { in: ids } } })
    }
    if (events.length) {
        await tx.mmAccountingEvent.deleteMany({
            where: { id: { in: events.map((e) => e.id) } },
        })
    }
    return { journals: docNums, events: events.map((e) => e.idempotencyKey) }
}

async function deleteOrderTree(tx, orderIds) {
    const orders = await tx.sdSalesOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
            id: true,
            orderNumber: true,
            lines: { select: { id: true, reservationHeaderId: true } },
        },
    })
    const lineIds = orders.flatMap((o) => o.lines.map((l) => l.id))
    const reservationHeaderIds = [
        ...new Set(
            orders
                .flatMap((o) => o.lines.map((l) => l.reservationHeaderId))
                .filter(Boolean),
        ),
    ]

    if (lineIds.length) {
        await tx.sdSalesOrderLine.updateMany({
            where: { id: { in: lineIds } },
            data: { reservationHeaderId: null },
        })
    }

    await tx.sdSalesInvoice.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdShipment.deleteMany({ where: { salesOrderId: { in: orderIds } } })
    await tx.sdSalesReturn.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdReturnRequest.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdPosVoidTransaction.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdPosCollection.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdPosReceivable.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdEmployeeLoanItem.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdSalesOrderPayment.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.productReview.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })

    const fulfillments = await tx.sdFulfillment.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const fulfillmentIds = fulfillments.map((f) => f.id)
    if (fulfillmentIds.length) {
        await tx.sdFulfillmentLine.deleteMany({
            where: { fulfillmentId: { in: fulfillmentIds } },
        })
    }
    await tx.sdFulfillment.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdSalesOrderLine.deleteMany({
        where: { salesOrderId: { in: orderIds } },
    })
    await tx.sdSalesOrder.deleteMany({ where: { id: { in: orderIds } } })

    if (reservationHeaderIds.length) {
        await tx.mmInventoryReservationLine.deleteMany({
            where: { headerId: { in: reservationHeaderIds } },
        })
        await tx.mmInventoryReservationHeader.deleteMany({
            where: { id: { in: reservationHeaderIds } },
        })
    }

    return orders.map((o) => o.orderNumber)
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const found = await prisma.sdSalesOrder.findMany({
            where: { orderNumber: { in: ORDER_NUMBERS } },
            select: { id: true, orderNumber: true, totalAmount: true },
            orderBy: { orderNumber: 'asc' },
        })
        const missing = ORDER_NUMBERS.filter(
            (n) => !found.some((f) => f.orderNumber === n),
        )
        console.log('Found orders:', found)
        if (missing.length) console.log('Not found:', missing)
        if (!found.length) return

        if (dryRun) {
            console.log('Dry run — no changes.')
            return
        }

        const ficoPurged = []
        await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)
            for (const o of found) {
                ficoPurged.push({
                    order: o.orderNumber,
                    ...(await purgeFicoForOrder(tx, o.id)),
                })
            }
            const deleted = await deleteOrderTree(
                tx,
                found.map((o) => o.id),
            )
            await enableFicoImmutabilityTriggers(tx)
            console.log('Deleted orders:', deleted)
        })
        console.log('FICO purged per order:', ficoPurged)

        const remaining = await prisma.sdSalesOrder.findMany({
            where: { orderNumber: { in: ORDER_NUMBERS } },
            select: { orderNumber: true },
        })
        console.log('Remaining:', remaining)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})