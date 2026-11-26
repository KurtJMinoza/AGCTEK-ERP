/**
 * Dev-only: remove POS revenue journal + mm accounting event (e.g. seed from POS-000002).
 * Disables FICO immutability triggers briefly — do not use on production posted history.
 *
 * Usage:
 *   node scripts/purge-pos-fico-seed.cjs [ORDER_NUMBER]
 */
const { PrismaClient } = require('@prisma/client')

const ORDER_NUMBER = process.argv[2] || 'POS-000002'

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

async function main() {
    const prisma = new PrismaClient()
    try {
        const order = await prisma.sdSalesOrder.findFirst({
            where: { orderNumber: ORDER_NUMBER },
            select: { id: true, orderNumber: true, companyId: true },
        })
        if (!order) {
            console.log(`Order ${ORDER_NUMBER} not found — nothing to purge.`)
            return
        }

        const idempotencyKey = `pos-revenue:${order.id}`
        const event = await prisma.mmAccountingEvent.findUnique({
            where: { idempotencyKey },
        })
        const journal = await prisma.ficoJournalEntry.findFirst({
            where: {
                OR: [
                    { sourcePostingKey: idempotencyKey },
                    { mmAccountingEventId: event?.id ?? undefined },
                ],
            },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                reversalOfId: true,
            },
        })

        if (!journal && !event) {
            console.log(`No FICO journal or accounting event for ${ORDER_NUMBER}.`)
            return
        }

        console.log('Found:', {
            order: order.orderNumber,
            eventId: event?.id ?? null,
            eventStatus: event?.status ?? null,
            journalId: journal?.id ?? null,
            journalNumber: journal?.documentNumber ?? null,
        })

        await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)

            const journalId = journal?.id
            const eventId = event?.id

            if (journalId) {
                await tx.ficoReconciliationCase.deleteMany({
                    where: {
                        OR: [
                            { journalEntryId: journalId },
                            ...(eventId
                                ? [{ mmAccountingEventId: eventId }]
                                : []),
                        ],
                    },
                })
                await tx.ficoAccountingAuditLog.deleteMany({
                    where: {
                        entityType: 'FicoJournalEntry',
                        entityId: journalId,
                    },
                })
                await tx.ficoJournalEntryLine.deleteMany({
                    where: { journalEntryId: journalId },
                })
                if (eventId) {
                    await tx.ficoJournalEntry.updateMany({
                        where: { id: journalId },
                        data: { mmAccountingEventId: null },
                    })
                }
                await tx.ficoJournalEntry.delete({ where: { id: journalId } })
            }

            if (eventId) {
                await tx.mmAccountingEvent.delete({ where: { id: eventId } })
            }

            await enableFicoImmutabilityTriggers(tx)
        })

        console.log(`Purged FICO seed for ${ORDER_NUMBER}.`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})