/**
 * Dev / reset: remove FICO postings, MM accounting bridge, account determination
 * rules/mappings, goods receipts/issues, and related inventory movements.
 *
 * Preserves: MM material/supplier/warehouse master, SD product catalog & customers,
 * COA, GL accounts, company FICO settings, treasury account master, determination rules.
 * Also removes procurement (PO/PR/RFQ/invoices), MRP runs, and supplier returns.
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

        await enableFicoImmutabilityTriggers(tx)
    })
    log('FICO journals & accounting events removed.')
}

const SD_PRESERVE_TABLES = new Set([
    'sd_products',
    'sd_product_import_batches',
    'sd_product_import_rows',
    'sd_product_options',
    'sd_product_option_values',
    'sd_product_variants',
    'sd_product_variant_option_values',
    'sd_product_material_assignments',
    'sd_pricing_conditions',
    'sd_branch_fulfillments',
    'sd_payment_methods',
    'sd_customers',
    'sd_email_templates',
    'sd_pdf_layout_profiles',
    'sd_sales_sources',
    'sd_employee_loan_items',
])

async function purgeFicoSubledgers(prisma: PrismaClient) {
    const counts = {
        apPayAlloc: await prisma.ficoApPaymentAllocation.count(),
        apPayments: await prisma.ficoApPayment.count(),
        apClearings: await prisma.ficoApClearing.count(),
        apOpen: await prisma.ficoApOpenItem.count(),
        apDocs: await prisma.ficoApDocument.count(),
        arPayments: await prisma.ficoArPayment.count(),
        arDocs: await prisma.ficoArDocument.count(),
        grir: await prisma.ficoGrIrOpenItem.count(),
        settlements: await prisma.ficoTreasurySettlement.count(),
        taxSnaps: await prisma.ficoTaxPostingSnapshot.count(),
    }
    log(`FICO subledger counts: ${JSON.stringify(counts)}`)
    if (dryRun) return

    await prisma.ficoApPaymentAllocation.deleteMany()
    await prisma.ficoApPayment.deleteMany()
    await prisma.ficoApClearingAllocation.deleteMany()
    await prisma.ficoApClearing.deleteMany()
    await prisma.ficoApGrIrAllocation.deleteMany()
    await prisma.ficoApOpenItem.deleteMany()
    await prisma.ficoApDocument.deleteMany()

    await prisma.ficoArPaymentAllocation.deleteMany()
    await prisma.ficoArPayment.deleteMany()
    await prisma.ficoArClearingLine.deleteMany()
    await prisma.ficoArClearing.deleteMany()
    await prisma.ficoArOpenItem.deleteMany()
    await prisma.ficoArDocumentLine.deleteMany()
    await prisma.ficoArDocument.deleteMany()

    await prisma.ficoGrIrOpenItem.deleteMany()
    await prisma.ficoArCreditProfile.deleteMany()
    await prisma.ficoTaxPostingSnapshot.deleteMany()
    await prisma.ficoTreasuryBankStatementLine.deleteMany()
    await prisma.ficoTreasurySettlement.deleteMany()
    await prisma.ficoHistoricalBackpostingRun.deleteMany().catch(() => undefined)

    log('FICO AP/AR, GR/IR, treasury postings, and tax snapshots removed.')
}

async function purgeProcurementAndMrp(prisma: PrismaClient) {
    const counts = {
        supplierInvoices: await prisma.mmSupplierInvoice.count(),
        purchaseOrders: await prisma.mmPurchaseOrder.count(),
        purchaseReqs: await prisma.mmPurchaseRequisition.count(),
        rfqs: await prisma.mmRfq.count(),
        mrpRuns: await prisma.mmMrpRun.count(),
        supplierReturns: await prisma.mmSupplierReturn.count(),
    }
    log(`Procurement/MRP counts: ${JSON.stringify(counts)}`)
    if (dryRun) return

    await prisma.mmSupplierInvoiceLineReceipt.deleteMany()
    await prisma.mmSupplierInvoiceLine.deleteMany()
    await prisma.mmSupplierInvoice.deleteMany()
    await prisma.mmMatchException.deleteMany()

    await prisma.mmSupplierReturnLine.deleteMany()
    await prisma.mmSupplierReturnAudit.deleteMany()
    await prisma.mmSupplierReturn.deleteMany()

    await prisma.mmPurchaseCommitment.deleteMany()
    await prisma.mmPurchaseOrderRevision.deleteMany()
    await prisma.mmPurchaseOrderAudit.deleteMany()
    await prisma.mmPurchaseOrderAttachment.deleteMany()
    await prisma.mmPurchaseOrderLine.deleteMany()
    await prisma.mmPurchaseOrder.deleteMany()

    await prisma.mmPrConversion.deleteMany()
    await prisma.mmPurchaseRequisitionLine.deleteMany()
    await prisma.mmPurchaseRequisitionAudit.deleteMany()
    await prisma.mmPurchaseRequisition.updateMany({
        data: { sourceMrpRunId: null },
    })
    await prisma.mmPurchaseRequisition.deleteMany()

    await prisma.mmRfqAward.deleteMany()
    await prisma.mmRfqAudit.deleteMany()
    await prisma.mmSupplierQuotationLine.deleteMany()
    await prisma.mmSupplierQuotation.deleteMany()
    await prisma.mmRfqSupplier.deleteMany()
    await prisma.mmRfqLine.deleteMany()
    await prisma.mmRfq.deleteMany()

    await prisma.mmProcurementSuggestion.deleteMany()
    await prisma.mmPlannedOrder.deleteMany()
    await prisma.mmSupplyProposal.deleteMany()
    await prisma.mmProjectedStock.deleteMany()
    await prisma.mmBomExplosionTrace.deleteMany()
    await prisma.mmMaterialRequirement.deleteMany()
    await prisma.mmMrpRun.deleteMany()

    log('Procurement, supplier invoices, MRP output, and supplier returns removed.')
}

async function purgeSdTransactional(prisma: PrismaClient) {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'sd_%'
        ORDER BY tablename
    `
    const toTruncate = tables
        .map((t) => t.tablename)
        .filter((name) => !SD_PRESERVE_TABLES.has(name))

    log(`SD transactional tables to truncate: ${toTruncate.length}`)
    if (dryRun) return
    if (!toTruncate.length) return

    const quoted = toTruncate.map((t) => `"${t}"`).join(', ')
    await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    )
    log('SD transactional data removed (product catalog & customers preserved).')
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

        await purgeSdTransactional(prisma)
        await purgeFicoSubledgers(prisma)
        await purgeFicoTransactional(prisma)
        await purgeAllGoodsReceipts(prisma)
        await cleanupPosMmTrail(prisma, dryRun)
        await purgeRemainingInventoryLedger(prisma)
        await purgeProcurementAndMrp(prisma)

        const after = {
            journals: await prisma.ficoJournalEntry.count(),
            events: await prisma.mmAccountingEvent.count(),
            gr: await prisma.mmGoodsReceipt.count(),
            gi: await prisma.mmGoodsIssue.count(),
            apDocs: await prisma.ficoApDocument.count(),
            arDocs: await prisma.ficoArDocument.count(),
            sdOrders: await prisma.sdSalesOrder.count(),
            products: await prisma.sdProduct.count(),
            materials: await prisma.mmMaterial.count(),
            invTxns: await prisma.mmInventoryTransaction.count(),
            glAccounts: await prisma.ficoGlAccount.count(),
            coa: await prisma.ficoChartOfAccounts.count(),
            pos: await prisma.mmPurchaseOrder.count(),
            mrpRuns: await prisma.mmMrpRun.count(),
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