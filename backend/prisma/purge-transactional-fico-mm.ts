/**
 * Dev / reset: remove FICO postings, MM accounting bridge, account determination
 * rules/mappings, goods receipts/issues, and related inventory movements.
 *
 * Preserves: materials (mm_material), SD product catalog, COA, GL accounts, company
 * FICO settings, determination profiles, transaction keys.
 *
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/purge-transactional-fico-mm.ts --dry-run
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/purge-transactional-fico-mm.ts
 */
import { PrismaClient } from '@prisma/client'
import { purgeInventoryTransactions } from './delete-inventory-ledger'
import { purgePostedGoodsReceiptAndDelete } from './delete-goods-receipts'
import { cleanupPosMmTrail } from './cleanup-pos-mm-trail'

const dryRun = process.argv.includes('--dry-run')
const log = (msg: string) => console.log(msg)

async function disableFicoImmutabilityTriggers(
    tx: Pick<PrismaClient, '$executeRawUnsafe'>,
) {
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

async function enableFicoImmutabilityTriggers(
    tx: Pick<PrismaClient, '$executeRawUnsafe'>,
) {
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

async function safeCount(
    label: string,
    run: () => Promise<number>,
): Promise<number> {
    try {
        return await run()
    } catch {
        log(`  skip count ${label} (table missing?)`)
        return 0
    }
}

/** Postgres aborts the whole tx on a failed statement — run optional deletes separately. */
async function deleteManyIfTableExists(
    prisma: PrismaClient,
    label: string,
    run: () => ReturnType<PrismaClient['ficoReconciliationCase']['deleteMany']>,
) {
    try {
        const result = await run()
        if (result.count > 0) {
            log(`  ${label}: deleted ${result.count}`)
        }
    } catch {
        log(`  skip delete ${label} (table missing?)`)
    }
}

async function purgeFicoTransactional(prisma: PrismaClient) {
    const counts = {
        journals: await prisma.ficoJournalEntry.count(),
        events: await prisma.mmAccountingEvent.count(),
        audits: await prisma.ficoAccountingAuditLog.count(),
        reconciliation: await safeCount('reconciliation', () =>
            prisma.ficoReconciliationCase.count(),
        ),
        obBatches: await safeCount('opening balances', () =>
            prisma.ficoOpeningBalanceBatch.count(),
        ),
        closingRuns: await safeCount('period closing', () =>
            prisma.ficoPeriodClosingRun.count(),
        ),
        detRules: await prisma.ficoAccountDeterminationRule.count(),
        mmMappings: await prisma.ficoMmAccountMapping.count(),
    }
    log(`FICO counts: ${JSON.stringify(counts)}`)
    if (dryRun) return

    await deleteManyIfTableExists(
        prisma,
        'reconciliation cases',
        () => prisma.ficoReconciliationCase.deleteMany(),
    )
    await deleteManyIfTableExists(
        prisma,
        'opening balance batches',
        () => prisma.ficoOpeningBalanceBatch.deleteMany(),
    )
    await deleteManyIfTableExists(
        prisma,
        'period closing runs',
        () => prisma.ficoPeriodClosingRun.deleteMany(),
    )

    await prisma.$transaction(async (tx) => {
        await disableFicoImmutabilityTriggers(tx)

        await tx.ficoJournalEntry.updateMany({
            data: { reversalOfId: null, mmAccountingEventId: null },
        })
        await tx.mmAccountingEvent.updateMany({ data: { journalEntryId: null } })

        await tx.ficoJournalEntryLine.deleteMany()
        await tx.ficoJournalEntry.deleteMany()
        await tx.mmAccountingEvent.deleteMany()
        await tx.ficoAccountingAuditLog.deleteMany()

        await tx.ficoAccountDeterminationRule.deleteMany()
        await tx.ficoMmAccountMapping.deleteMany()

        await enableFicoImmutabilityTriggers(tx)
    })
    log('FICO transactional data removed.')
}

async function purgeAllGoodsReceipts(prisma: PrismaClient) {
    const grs = await prisma.mmGoodsReceipt.findMany({
        select: { documentNumber: true, status: true },
        orderBy: { documentNumber: 'asc' },
    })
    log(`Goods receipts: ${grs.length}`)
    if (dryRun) return

    for (const gr of grs) {
        await purgePostedGoodsReceiptAndDelete(prisma, gr.documentNumber)
    }
    log('All goods receipts removed.')
}

async function purgeRemainingInventoryLedger(prisma: PrismaClient) {
    const txns = await prisma.mmInventoryTransaction.findMany({
        select: { id: true },
    })
    log(`Remaining inventory txns: ${txns.length}`)
    if (dryRun || !txns.length) return
    await purgeInventoryTransactions(
        prisma,
        txns.map((t) => t.id),
    )
    await prisma.mmInventoryBalance.deleteMany()
    await prisma.mmMaterial.updateMany({
        data: { onHandQty: 0, reservedQty: 0 },
    })
    log('Inventory ledger cleared; material on-hand reset to 0.')
}

async function main() {
    const prisma = new PrismaClient()
    try {
        log(dryRun ? '=== DRY RUN ===' : '=== PURGE TRANSACTIONAL FICO / MM ===')
        const materials = await prisma.mmMaterial.count()
        const products = await prisma.sdProduct.count()
        log(`Preserving materials=${materials}, sd products=${products}`)

        await purgeFicoTransactional(prisma)
        await purgeAllGoodsReceipts(prisma)
        await cleanupPosMmTrail(prisma, dryRun)
        await purgeRemainingInventoryLedger(prisma)

        const after = {
            journals: await prisma.ficoJournalEntry.count(),
            events: await prisma.mmAccountingEvent.count(),
            gr: await prisma.mmGoodsReceipt.count(),
            gi: await prisma.mmGoodsIssue.count(),
            detRules: await prisma.ficoAccountDeterminationRule.count(),
            mmMappings: await prisma.ficoMmAccountMapping.count(),
            invTxns: await prisma.mmInventoryTransaction.count(),
        }
        log(`After: ${JSON.stringify(after)}`)
        log('Done.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})