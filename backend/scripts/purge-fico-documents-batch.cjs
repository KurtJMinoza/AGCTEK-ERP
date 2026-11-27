/**
 * Dev-only: hard-delete specific FICO journals (and linked bridge/AP rows) by document number.
 * Disables journal immutability triggers briefly.
 *
 * Usage:
 *   node scripts/purge-fico-documents-batch.cjs
 *   node scripts/purge-fico-documents-batch.cjs --dry-run
 */
const { PrismaClient } = require('@prisma/client')

const DEFAULT_DOCUMENT_NUMBERS = [
    'SR-2026-000002',
    'PS-2026-000004',
    'SR-2026-000003',
    'RV-2026-000001',
    'JE-2026-000002',
    'JE-2026-000003',
    'PS-2026-000003',
    'PS-2026-000002',
    'JE-2026-000001',
    'SR-2026-000001',
]

const dryRun = process.argv.includes('--dry-run')
const extraArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const purgeFailedOnly = process.argv.includes('--purge-failed-events')
const DOCUMENT_NUMBERS =
    extraArgs.length > 0 ? extraArgs : DEFAULT_DOCUMENT_NUMBERS

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

async function collectJournalIds(prisma, documentNumbers) {
    const primary = await prisma.ficoJournalEntry.findMany({
        where: { documentNumber: { in: documentNumbers } },
        select: {
            id: true,
            documentNumber: true,
            reversalOfId: true,
            mmAccountingEventId: true,
            sourcePostingKey: true,
        },
    })
    const primaryIds = primary.map((j) => j.id)
    const linked = await prisma.ficoJournalEntry.findMany({
        where: {
            OR: [
                { reversalOfId: { in: primaryIds } },
                { id: { in: primary.flatMap((j) => (j.reversalOfId ? [j.reversalOfId] : [])) } },
            ],
        },
        select: {
            id: true,
            documentNumber: true,
            reversalOfId: true,
            mmAccountingEventId: true,
        },
    })
    const all = new Map()
    for (const row of [...primary, ...linked]) {
        all.set(row.id, row)
    }
    return [...all.values()]
}

async function main() {
    const prisma = new PrismaClient()
    try {
        if (purgeFailedOnly) {
            const failed = await prisma.mmAccountingEvent.findMany({
                where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
                select: { id: true, eventType: true, idempotencyKey: true },
            })
            console.log('Failed / dead-letter events to delete:', failed)
            if (dryRun || !failed.length) {
                if (dryRun) console.log('Dry run — no changes made.')
                return
            }
            await prisma.mmAccountingEvent.deleteMany({
                where: { id: { in: failed.map((e) => e.id) } },
            })
            console.log(`Deleted ${failed.length} failed accounting event(s).`)
            return
        }

        const journals = await collectJournalIds(prisma, DOCUMENT_NUMBERS)
        if (!journals.length) {
            console.log('No matching journals found.')
            return
        }
        const journalIds = journals.map((j) => j.id)
        const eventIds = [
            ...new Set(
                journals.map((j) => j.mmAccountingEventId).filter(Boolean),
            ),
        ]

        const eventsByKey = await prisma.mmAccountingEvent.findMany({
            where: {
                OR: [
                    { journalEntryId: { in: journalIds } },
                    { id: { in: eventIds } },
                    ...(journals
                        .map((j) => j.sourcePostingKey)
                        .filter(Boolean)
                        .map((k) => ({ idempotencyKey: k })) ?? []),
                ],
            },
            select: {
                id: true,
                idempotencyKey: true,
                eventType: true,
                documentId: true,
            },
        })
        const allEventIds = [
            ...new Set([...eventIds, ...eventsByKey.map((e) => e.id)]),
        ]

        const apDocs = await prisma.ficoApDocument.findMany({
            where: {
                OR: [
                    { journalEntryId: { in: journalIds } },
                    { reversalJournalEntryId: { in: journalIds } },
                ],
            },
            select: { id: true, journalEntryId: true, reversalJournalEntryId: true },
        })
        const apDocIds = apDocs.map((d) => d.id)

        console.log('Journals to purge:', journals.map((j) => j.documentNumber).sort())
        console.log('Accounting events:', eventsByKey)
        console.log('AP documents:', apDocs)

        if (dryRun) {
            console.log('Dry run — no changes made.')
            return
        }

        await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)

            if (apDocIds.length) {
                await tx.ficoApGrirAllocation.deleteMany({
                    where: { documentId: { in: apDocIds } },
                })
                await tx.ficoApOpenItem.deleteMany({
                    where: { documentId: { in: apDocIds } },
                })
                await tx.ficoApDocument.updateMany({
                    where: { originalDocumentId: { in: apDocIds } },
                    data: { originalDocumentId: null },
                })
                await tx.ficoApDocument.updateMany({
                    where: { id: { in: apDocIds } },
                    data: { reversalJournalEntryId: null },
                })
                await tx.ficoApDocument.deleteMany({
                    where: { id: { in: apDocIds } },
                })
            }

            await tx.ficoApPayment.updateMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { reversalJournalEntryId: { in: journalIds } },
                    ],
                },
                data: { reversalJournalEntryId: null },
            })
            await tx.ficoApPayment.deleteMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { reversalJournalEntryId: { in: journalIds } },
                    ],
                },
            })

            await tx.ficoApClearing.updateMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { reversalJournalEntryId: { in: journalIds } },
                    ],
                },
                data: { reversalJournalEntryId: null },
            })
            await tx.ficoApClearing.deleteMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { reversalJournalEntryId: { in: journalIds } },
                    ],
                },
            })

            const eventDocIds = eventsByKey
                .filter((e) => e.eventType === 'GoodsReceiptPosted')
                .map((e) => e.documentId)
                .filter(Boolean)
            const grirDeleted = await tx.ficoGrIrOpenItem.deleteMany({
                where: {
                    OR: [
                        { goodsReceiptJournalEntryId: { in: journalIds } },
                        { lastInvoiceJournalEntryId: { in: journalIds } },
                        ...(eventDocIds.length
                            ? [{ goodsReceiptId: { in: eventDocIds } }]
                            : []),
                    ],
                },
            })
            if (grirDeleted.count) {
                console.log(`  GR/IR open items deleted: ${grirDeleted.count}`)
            }

            await tx.ficoReconciliationCase.deleteMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { mmAccountingEventId: { in: allEventIds } },
                    ],
                },
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

            await tx.mmAccountingEvent.updateMany({
                where: { journalEntryId: { in: journalIds } },
                data: { journalEntryId: null },
            })

            await tx.ficoJournalEntryLine.deleteMany({
                where: { journalEntryId: { in: journalIds } },
            })
            await tx.ficoJournalEntry.deleteMany({
                where: { id: { in: journalIds } },
            })

            if (allEventIds.length) {
                await tx.mmAccountingEvent.deleteMany({
                    where: { id: { in: allEventIds } },
                })
            }

            await enableFicoImmutabilityTriggers(tx)
        })

        const remaining = await prisma.ficoJournalEntry.findMany({
            where: { documentNumber: { in: DOCUMENT_NUMBERS } },
            select: { documentNumber: true },
        })
        console.log('Purged. Remaining:', remaining)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})