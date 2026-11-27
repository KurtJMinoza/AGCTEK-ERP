/**
 * Removes seed-ar-v1-demo AR rows (open items, AR docs, journals, invoices, orders).
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/cleanup-ar-v1-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TAG = 'seed-ar-v1-demo'

async function main() {
    const invoices = await prisma.sdSalesInvoice.findMany({
        where: {
            OR: [
                { createdBy: TAG },
                { invoiceNumber: { startsWith: 'AR-INV-' } },
            ],
        },
        select: {
            id: true,
            invoiceNumber: true,
            salesOrderId: true,
            ficoArDocument: {
                select: {
                    id: true,
                    journalEntryId: true,
                    clearingJournalEntryId: true,
                },
            },
        },
    })
    const orders = await prisma.sdSalesOrder.findMany({
        where: {
            OR: [
                { createdBy: TAG },
                { orderNumber: { startsWith: 'AR-SO-' } },
            ],
        },
        select: { id: true, orderNumber: true },
    })
    const arDocs = await prisma.ficoArDocument.findMany({
        select: {
            id: true,
            referenceNumber: true,
            journalEntryId: true,
            clearingJournalEntryId: true,
        },
    })
    const arOpen = await prisma.ficoArOpenItem.findMany({
        select: { id: true, documentId: true },
    })
    const journals = await prisma.ficoJournalEntry.findMany({
        where: {
            OR: [
                { sourceModule: 'AR' },
                {
                    documentType: {
                        in: ['CUSTOMER_INVOICE', 'CUSTOMER_RECEIPT'],
                    },
                },
                { idempotencyKey: { startsWith: 'sales-invoice-ar:' } },
                { sourcePostingKey: { startsWith: 'sales-invoice-ar:' } },
                { description: { startsWith: 'Customer invoice AR-INV-' } },
            ],
        },
        select: {
            id: true,
            documentNumber: true,
            description: true,
            status: true,
            idempotencyKey: true,
        },
    })

    console.log(
        JSON.stringify(
            {
                invoices: invoices.map((i) => i.invoiceNumber),
                orders: orders.map((o) => o.orderNumber),
                arDocs: arDocs.map((d) => d.referenceNumber),
                arOpenCount: arOpen.length,
                journals: journals.map((j) => ({
                    id: j.id,
                    documentNumber: j.documentNumber,
                    description: j.description,
                })),
            },
            null,
            2,
        ),
    )

    const arDocIds = arDocs.map((d) => d.id)
    const journalIds = [
        ...new Set([
            ...journals.map((j) => j.id),
            ...arDocs.flatMap((d) =>
                [d.journalEntryId, d.clearingJournalEntryId].filter(
                    (id): id is string => Boolean(id),
                ),
            ),
        ]),
    ]
    const invoiceIds = invoices.map((inv) => inv.id)
    const orderIds = [
        ...new Set([
            ...orders.map((o) => o.id),
            ...invoices.map((inv) => inv.salesOrderId),
        ]),
    ]

    if (
        arDocIds.length === 0 &&
        journalIds.length === 0 &&
        invoiceIds.length === 0 &&
        orderIds.length === 0 &&
        arOpen.length === 0
    ) {
        console.log('Nothing left to delete.')
        return
    }

    await prisma.$transaction(async (tx) => {
        if (arOpen.length > 0) {
            const open = await tx.ficoArOpenItem.deleteMany({
                where: { id: { in: arOpen.map((o) => o.id) } },
            })
            console.log(`Deleted ${open.count} AR open item(s).`)
        }
        if (arDocIds.length > 0) {
            const docs = await tx.ficoArDocument.deleteMany({
                where: { id: { in: arDocIds } },
            })
            console.log(`Deleted ${docs.count} AR document(s).`)
        }

        if (journalIds.length > 0) {
            await tx.$executeRawUnsafe(
                `ALTER TABLE fico_journal_entry_lines DISABLE TRIGGER fico_journal_entry_lines_immutable`,
            )
            await tx.$executeRawUnsafe(
                `ALTER TABLE fico_journal_entries DISABLE TRIGGER fico_journal_entries_immutable`,
            )
            await tx.$executeRawUnsafe(
                `ALTER TABLE fico_accounting_audit_logs DISABLE TRIGGER fico_accounting_audit_logs_append_only`,
            )
            try {
                await tx.ficoJournalEntryLine.deleteMany({
                    where: { journalEntryId: { in: journalIds } },
                })
                await tx.$executeRawUnsafe(
                    `DELETE FROM fico_accounting_audit_logs WHERE "entityId" = ANY($1::text[])`,
                    journalIds,
                )
                const je = await tx.ficoJournalEntry.deleteMany({
                    where: { id: { in: journalIds } },
                })
                console.log(`Deleted ${je.count} journal(s).`)
            } finally {
                await tx.$executeRawUnsafe(
                    `ALTER TABLE fico_accounting_audit_logs ENABLE TRIGGER fico_accounting_audit_logs_append_only`,
                )
                await tx.$executeRawUnsafe(
                    `ALTER TABLE fico_journal_entry_lines ENABLE TRIGGER fico_journal_entry_lines_immutable`,
                )
                await tx.$executeRawUnsafe(
                    `ALTER TABLE fico_journal_entries ENABLE TRIGGER fico_journal_entries_immutable`,
                )
            }
        }

        if (invoiceIds.length > 0) {
            await tx.sdSalesInvoiceLine.deleteMany({
                where: { invoiceId: { in: invoiceIds } },
            })
            const invDel = await tx.sdSalesInvoice.deleteMany({
                where: { id: { in: invoiceIds } },
            })
            console.log(`Deleted ${invDel.count} sales invoice(s).`)
        }

        if (orderIds.length > 0) {
            await tx.sdSalesOrderLine.deleteMany({
                where: { salesOrderId: { in: orderIds } },
            })
            const ordDel = await tx.sdSalesOrder.deleteMany({
                where: { id: { in: orderIds } },
            })
            console.log(`Deleted ${ordDel.count} sales order(s).`)
        }

        const events = await tx.mmAccountingEvent.deleteMany({
            where: {
                OR: [
                    { idempotencyKey: { startsWith: 'sales-invoice-ar:' } },
                    ...(invoiceIds.length
                        ? [
                              {
                                  documentId: { in: invoiceIds },
                                  eventType: {
                                      in: [
                                          'SalesInvoiceIssued',
                                          'SalesInvoicePaid',
                                      ],
                                  },
                              },
                          ]
                        : []),
                ],
            },
        })
        console.log(`Deleted ${events.count} accounting event(s).`)
    })

    console.log(
        JSON.stringify(
            {
                remainingOpenItems: await prisma.ficoArOpenItem.count(),
                remainingArDocs: await prisma.ficoArDocument.count(),
                remainingDemoInvoices: await prisma.sdSalesInvoice.count({
                    where: { invoiceNumber: { startsWith: 'AR-INV-' } },
                }),
                remainingDemoOrders: await prisma.sdSalesOrder.count({
                    where: { orderNumber: { startsWith: 'AR-SO-' } },
                }),
                remainingArJournals: await prisma.ficoJournalEntry.count({
                    where: { sourceModule: 'AR' },
                }),
            },
            null,
            2,
        ),
    )
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
