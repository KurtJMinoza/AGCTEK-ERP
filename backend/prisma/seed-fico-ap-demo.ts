/**
 * Removes AP demo data + linked JE-DEMO journals created by the former AP demo seed.
 *
 *   cd backend && npm run prisma:clean-ap-demo
 *
 * Tags: referenceNumber AP-000*, suppliers SEED-AP-*, idempotencyKey seed-fico-ap-demo:* / seed-fico-ap-pay-*
 */
import { PrismaClient } from '@prisma/client'

const TAG = 'seed-fico-ap-demo'
const REF_PREFIX = 'AP-000'
const SUPPLIER_PREFIX = 'SEED-AP-'

async function disableFicoImmutabilityTriggers(tx: Pick<PrismaClient, '$executeRawUnsafe'>) {
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entry_lines" DISABLE TRIGGER "fico_journal_entry_lines_immutable"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entries" DISABLE TRIGGER "fico_journal_entries_immutable"`,
    )
}

async function enableFicoImmutabilityTriggers(tx: Pick<PrismaClient, '$executeRawUnsafe'>) {
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entries" ENABLE TRIGGER "fico_journal_entries_immutable"`,
    )
    await tx.$executeRawUnsafe(
        `ALTER TABLE "fico_journal_entry_lines" ENABLE TRIGGER "fico_journal_entry_lines_immutable"`,
    )
}

async function cleanDemo(prisma: PrismaClient) {
    const docs = await prisma.ficoApDocument.findMany({
        where: { referenceNumber: { startsWith: REF_PREFIX } },
        select: {
            id: true,
            journalEntryId: true,
            reversalJournalEntryId: true,
        },
    })
    const docIds = docs.map((d) => d.id)
    const journalIds = [
        ...new Set(
            docs.flatMap((d) =>
                [d.journalEntryId, d.reversalJournalEntryId].filter(Boolean) as string[],
            ),
        ),
    ]

    const payments = await prisma.ficoApPayment.findMany({
        where: { idempotencyKey: { startsWith: 'seed-fico-ap-pay-' } },
        select: { id: true, journalEntryId: true },
    })
    const paymentJournalIds = payments.map((p) => p.journalEntryId)

    await prisma.ficoApPaymentAllocation.deleteMany({
        where: {
            OR: [
                { paymentId: { in: payments.map((p) => p.id) } },
                { openItem: { documentId: { in: docIds } } },
            ],
        },
    })
    await prisma.ficoApPayment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } })

    await prisma.ficoApClearingAllocation.deleteMany({
        where: {
            OR: [
                { debitOpenItem: { documentId: { in: docIds } } },
                { creditOpenItem: { documentId: { in: docIds } } },
            ],
        },
    })

    await prisma.ficoApOpenItem.deleteMany({ where: { documentId: { in: docIds } } })
    await prisma.ficoApDocument.deleteMany({ where: { id: { in: docIds } } })

    const taggedJournals = await prisma.ficoJournalEntry.findMany({
        where: {
            OR: [
                { idempotencyKey: { startsWith: `${TAG}:` } },
                { idempotencyKey: { startsWith: 'seed-fico-ap-pay-' } },
                { documentNumber: { startsWith: 'JE-DEMO-' } },
                { sourcePostingKey: { startsWith: `${TAG}:` } },
                { sourcePostingKey: { startsWith: 'seed-fico-ap-pay-' } },
                { sourceDocumentType: 'AP_DEMO_SEED' },
            ],
        },
        select: { id: true },
    })
    const allJournalIds = [
        ...new Set([
            ...journalIds,
            ...paymentJournalIds,
            ...taggedJournals.map((j) => j.id),
        ]),
    ]
    if (allJournalIds.length) {
        await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)
            await tx.ficoJournalEntry.updateMany({
                where: { id: { in: allJournalIds } },
                data: { reversalOfId: null, mmAccountingEventId: null },
            })
            await tx.ficoJournalEntryLine.deleteMany({
                where: { journalEntryId: { in: allJournalIds } },
            })
            await tx.ficoJournalEntry.deleteMany({
                where: { id: { in: allJournalIds } },
            })
            await enableFicoImmutabilityTriggers(tx)
        })
    }

    for (const code of ['SEED-AP-OPENING', 'SEED-AP-BANK-PAY']) {
        const rule = await prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: code },
            select: { id: true },
        })
        if (rule) {
            await prisma.ficoAccountDeterminationLine.deleteMany({ where: { ruleId: rule.id } })
            await prisma.ficoAccountDeterminationRule.delete({ where: { id: rule.id } })
        }
    }

    await prisma.ficoHistoricalBackpostingRun.deleteMany({
        where: { fromDate: new Date('2026-11-01'), toDate: new Date('2026-11-30') },
    })

    await prisma.ficoSupplierCompanyAccount.deleteMany({
        where: { supplier: { supplierCode: { startsWith: SUPPLIER_PREFIX } } },
    })

    const { count } = await prisma.mmSupplier.deleteMany({
        where: { supplierCode: { startsWith: SUPPLIER_PREFIX } },
    })

    console.log(
        `Removed ${docIds.length} AP demo document(s), ${allJournalIds.length} journal(s), and ${count} supplier(s).`,
    )
}

async function main() {
    const prisma = new PrismaClient()
    try {
        await cleanDemo(prisma)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})