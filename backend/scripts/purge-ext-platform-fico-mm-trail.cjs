/**
 * Hard-delete external platform (EPT) transactions + linked FICO journals, MM GIs, ledger.
 *
 *   node scripts/purge-ext-platform-fico-mm-trail.cjs EPT-000806
 */
const { PrismaClient } = require('@prisma/client')

const EXT_GI_SOURCE = 'EXT_PLATFORM_SALE'
const txNumbers = process.argv.slice(2)
if (!txNumbers.length) {
    console.error(
        'Usage: node scripts/purge-ext-platform-fico-mm-trail.cjs <transactionNumber> [...]',
    )
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

async function collectJournalIds(prisma, txIds, giIds) {
    const found = new Set()
    let expanded = true
    while (expanded) {
        expanded = false
        const or = [
            ...(txIds.length ? [{ sourceDocumentId: { in: txIds } }] : []),
            ...(giIds.length ? [{ sourceDocumentId: { in: giIds } }] : []),
            ...txIds.map((id) => ({
                idempotencyKey: { startsWith: `ext-platform-revenue:${id}` },
            })),
            ...txIds.map((id) => ({
                idempotencyKey: { startsWith: `ext-platform-void:${id}` },
            })),
            ...giIds.map((id) => ({ idempotencyKey: { contains: id } })),
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

async function main() {
    const prisma = new PrismaClient()
    try {
        const txs = await prisma.sdExtPlatformTransaction.findMany({
            where: { transactionNumber: { in: txNumbers } },
            select: { id: true, transactionNumber: true },
        })
        const txIds = txs.map((t) => t.id)
        console.log(
            'EPT:',
            txs.map((t) => t.transactionNumber).join(', ') || '(none)',
        )

        const gis = txIds.length
            ? await prisma.mmGoodsIssue.findMany({
                  where: {
                      sourceDocumentType: EXT_GI_SOURCE,
                      sourceDocumentId: { in: txIds },
                  },
                  select: { id: true, documentNumber: true },
              })
            : []
        const giIds = gis.map((g) => g.id)
        console.log('Goods issues:', gis.map((g) => g.documentNumber).join(', ') || '(none)')

        const { ids: journalIds, numbers: journalNumbers } =
            await collectJournalIds(prisma, txIds, giIds)
        console.log(
            'Journals to delete:',
            journalNumbers.sort().join(', ') || '(none)',
        )

        if (txIds.length) {
            const arDocs = await prisma.ficoArDocument.findMany({
                where: { sourceExtPlatformTransactionId: { in: txIds } },
                select: { id: true, openItem: { select: { id: true } } },
            })
            if (arDocs.length) {
                const docIds = arDocs.map((d) => d.id)
                const openIds = arDocs
                    .map((d) => d.openItem?.id)
                    .filter(Boolean)
                if (openIds.length) {
                    await prisma.ficoArPaymentAllocation.deleteMany({
                        where: { openItemId: { in: openIds } },
                    })
                    await prisma.ficoArClearingLine.deleteMany({
                        where: {
                            OR: [
                                { debitOpenItemId: { in: openIds } },
                                { creditOpenItemId: { in: openIds } },
                            ],
                        },
                    })
                    await prisma.ficoArOpenItem.deleteMany({
                        where: { id: { in: openIds } },
                    })
                }
                await prisma.ficoArDocumentLine.deleteMany({
                    where: { documentId: { in: docIds } },
                })
                const arDel = await prisma.ficoArDocument.deleteMany({
                    where: { id: { in: docIds } },
                })
                console.log(`Deleted ${arDel.count} marketplace AR document(s).`)
            }
        }

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
        for (const id of txIds) {
            eventOr.push({ documentId: id })
            eventOr.push({ idempotencyKey: { startsWith: `ext-platform-revenue:${id}` } })
            eventOr.push({ idempotencyKey: { startsWith: `ext-platform-void:${id}` } })
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

        if (giIds.length) {
            await prisma.$transaction(async (tx) => {
                await tx.mmGoodsIssueLine.deleteMany({ where: { issueId: { in: giIds } } })
                await tx.mmGoodsIssue.deleteMany({ where: { id: { in: giIds } } })
            })
            console.log(`Removed ${giIds.length} GI(s).`)
        }

        if (txIds.length) {
            await prisma.sdExtPlatformTransactionLine.deleteMany({
                where: { transactionId: { in: txIds } },
            })
            const del = await prisma.sdExtPlatformTransaction.deleteMany({
                where: { id: { in: txIds } },
            })
            console.log(`Deleted ${del.count} EPT transaction(s).`)
        }

        const verify = {
            ept: await prisma.sdExtPlatformTransaction.count({
                where: { transactionNumber: { in: txNumbers } },
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