/**
 * Dev-only: hard-delete journal entries, AR (and AP if any) for a walk-in / customer POS trail.
 *
 *   node scripts/purge-customer-fico-trail.cjs --dry-run
 *   node scripts/purge-customer-fico-trail.cjs WALK-000001
 *   node scripts/purge-customer-fico-trail.cjs WALK-000001 POS-000003
 */
const { PrismaClient } = require('@prisma/client')

const dryRun = process.argv.includes('--dry-run')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const CUSTOMER_NUMBER = args[0] || 'WALK-000001'
const ORDER_FILTER = args.slice(1)

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

async function collectJournalIds(prisma, seeds) {
    const journalIds = new Set(seeds)
    let expanded = true
    while (expanded) {
        expanded = false
        const batch = [...journalIds]
        const linked = await prisma.ficoJournalEntry.findMany({
            where: {
                OR: [
                    { reversalOfId: { in: batch } },
                    { id: { in: batch } },
                ],
            },
            select: { id: true, reversalOfId: true },
        })
        for (const row of linked) {
            if (!journalIds.has(row.id)) {
                journalIds.add(row.id)
                expanded = true
            }
            if (row.reversalOfId && !journalIds.has(row.reversalOfId)) {
                journalIds.add(row.reversalOfId)
                expanded = true
            }
        }
    }
    return [...journalIds]
}

async function deleteApForJournals(tx, journalIds) {
    const apDocs = await tx.ficoApDocument.findMany({
        where: {
            OR: [
                { journalEntryId: { in: journalIds } },
                { reversalJournalEntryId: { in: journalIds } },
            ],
        },
        select: { id: true },
    })
    const apDocIds = apDocs.map((d) => d.id)
    if (!apDocIds.length) return { apDocs: 0 }

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
    const deletedAp = await tx.ficoApDocument.deleteMany({
        where: { id: { in: apDocIds } },
    })

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

    return { apDocs: deletedAp.count }
}

async function deleteArForCustomer(tx, customerId, journalIds) {
    const arDocs = await tx.ficoArDocument.findMany({
        where: { customerId },
        select: { id: true, journalEntryId: true },
    })
    const arDocIds = arDocs.map((d) => d.id)
    const openItems = await tx.ficoArOpenItem.findMany({
        where: { customerId },
        select: { id: true },
    })
    const openItemIds = openItems.map((o) => o.id)

    const payments = await tx.ficoArPayment.findMany({
        where: { customerId },
        select: { id: true, journalEntryId: true },
    })
    const paymentIds = payments.map((p) => p.id)

    const clearings = await tx.ficoArClearing.findMany({
        where: { customerId },
        select: { id: true, journalEntryId: true },
    })
    const clearingIds = clearings.map((c) => c.id)

    for (const id of [
        ...arDocs.map((d) => d.journalEntryId),
        ...payments.map((p) => p.journalEntryId),
        ...clearings.map((c) => c.journalEntryId),
    ]) {
        if (id) journalIds.add(id)
    }

    if (openItemIds.length) {
        await tx.ficoArPaymentAllocation.deleteMany({
            where: {
                OR: [
                    { openItemId: { in: openItemIds } },
                    { paymentId: { in: paymentIds } },
                ],
            },
        })
        await tx.ficoArClearingLine.deleteMany({
            where: {
                OR: [
                    { debitOpenItemId: { in: openItemIds } },
                    { creditOpenItemId: { in: openItemIds } },
                    { clearingId: { in: clearingIds } },
                ],
            },
        })
    } else if (clearingIds.length) {
        await tx.ficoArClearingLine.deleteMany({
            where: { clearingId: { in: clearingIds } },
        })
    }

    if (paymentIds.length) {
        await tx.ficoArPayment.updateMany({
            where: { id: { in: paymentIds } },
            data: { reversalJournalEntryId: null },
        })
        await tx.ficoArPayment.deleteMany({ where: { id: { in: paymentIds } } })
    }

    if (clearingIds.length) {
        await tx.ficoArClearing.updateMany({
            where: { id: { in: clearingIds } },
            data: { reversalJournalEntryId: null },
        })
        await tx.ficoArClearing.deleteMany({ where: { id: { in: clearingIds } } })
    }

    if (openItemIds.length) {
        await tx.ficoArOpenItem.deleteMany({ where: { id: { in: openItemIds } } })
    }

    if (arDocIds.length) {
        await tx.ficoArDocumentLine.deleteMany({
            where: { documentId: { in: arDocIds } },
        })
        await tx.ficoArDocument.updateMany({
            where: { originalDocumentId: { in: arDocIds } },
            data: { originalDocumentId: null },
        })
        await tx.ficoArDocument.updateMany({
            where: { id: { in: arDocIds } },
            data: { reversalJournalEntryId: null },
        })
        await tx.ficoArDocument.deleteMany({ where: { id: { in: arDocIds } } })
    }

    return {
        arDocs: arDocIds.length,
        openItems: openItemIds.length,
        payments: paymentIds.length,
        clearings: clearingIds.length,
    }
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const customer = await prisma.sdCustomer.findFirst({
            where: { customerNumber: CUSTOMER_NUMBER },
            select: { id: true, customerNumber: true, companyName: true },
        })
        if (!customer) {
            console.log(`Customer ${CUSTOMER_NUMBER} not found.`)
            return
        }

        const orderWhere = {
            customerId: customer.id,
            ...(ORDER_FILTER.length
                ? { orderNumber: { in: ORDER_FILTER } }
                : {}),
        }
        const orders = await prisma.sdSalesOrder.findMany({
            where: orderWhere,
            select: { id: true, orderNumber: true },
            orderBy: { orderNumber: 'asc' },
        })
        const orderIds = orders.map((o) => o.id)
        const orderNumbers = orders.map((o) => o.orderNumber)

        const collections = orderIds.length
            ? await prisma.sdPosCollection.findMany({
                  where: { salesOrderId: { in: orderIds } },
                  select: { id: true, collectionNumber: true },
              })
            : []
        const collectionIds = collections.map((c) => c.id)

        const events = await prisma.mmAccountingEvent.findMany({
            where: {
                OR: [
                    { documentId: { in: orderIds } },
                    { documentId: { in: collectionIds } },
                    ...orderIds.map((id) => ({
                        idempotencyKey: { contains: id },
                    })),
                ],
            },
            select: {
                id: true,
                eventType: true,
                idempotencyKey: true,
                journalEntryId: true,
            },
        })

        const journalSeed = new Set(
            events.map((e) => e.journalEntryId).filter(Boolean),
        )
        for (const on of orderNumbers) {
            const byDesc = await prisma.ficoJournalEntry.findMany({
                where: { description: { contains: on } },
                select: { id: true, documentNumber: true },
            })
            for (const j of byDesc) journalSeed.add(j.id)
        }
        for (const col of collections) {
            const byCol = await prisma.ficoJournalEntry.findMany({
                where: { description: { contains: col.collectionNumber } },
                select: { id: true, documentNumber: true },
            })
            for (const j of byCol) journalSeed.add(j.id)
        }

        const journalsPreview = await prisma.ficoJournalEntry.findMany({
            where: { id: { in: [...journalSeed] } },
            select: { documentNumber: true, documentType: true },
            orderBy: { documentNumber: 'asc' },
        })

        const arBefore = await prisma.ficoArOpenItem.count({
            where: { customerId: customer.id },
        })
        const apBefore = await prisma.ficoApOpenItem.count({
            where: { document: { supplierId: customer.id } },
        })

        console.log('Customer:', customer)
        console.log('Orders:', orders)
        console.log('Collections:', collections)
        console.log('Accounting events:', events.length)
        console.log('Journals (seed):', journalsPreview)
        console.log(`AR open items before: ${arBefore}, AP open items (supplier=customer): ${apBefore}`)

        if (dryRun) {
            console.log('Dry run — no changes.')
            return
        }

        const journalIdsSet = new Set(
            await collectJournalIds(prisma, [...journalSeed]),
        )

        const summary = await prisma.$transaction(async (tx) => {
            await disableFicoImmutabilityTriggers(tx)

            const ar = await deleteArForCustomer(
                tx,
                customer.id,
                journalIdsSet,
            )
            const ap = await deleteApForJournals(tx, [...journalIdsSet])

            const journalIds = [...journalIdsSet]
            const eventIds = events.map((e) => e.id)

            await tx.ficoArCreditProfile.deleteMany({
                where: { customerId: customer.id },
            })

            await tx.ficoReconciliationCase.deleteMany({
                where: {
                    OR: [
                        { journalEntryId: { in: journalIds } },
                        { mmAccountingEventId: { in: eventIds } },
                    ],
                },
            })
            await tx.ficoTaxPostingSnapshot.deleteMany({
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
            await tx.mmAccountingEvent.updateMany({
                where: { journalEntryId: { in: journalIds } },
                data: { journalEntryId: null },
            })
            await tx.ficoJournalEntryLine.deleteMany({
                where: { journalEntryId: { in: journalIds } },
            })
            const deletedJournals = await tx.ficoJournalEntry.deleteMany({
                where: { id: { in: journalIds } },
            })
            const deletedEvents = eventIds.length
                ? await tx.mmAccountingEvent.deleteMany({
                      where: { id: { in: eventIds } },
                  })
                : { count: 0 }

            await enableFicoImmutabilityTriggers(tx)

            return { ...ar, ...ap, journals: deletedJournals.count, events: deletedEvents.count }
        })

        const arAfter = await prisma.ficoArOpenItem.count({
            where: { customerId: customer.id },
        })
        const journalsAfter = await prisma.ficoJournalEntry.count({
            where: { id: { in: [...journalSeed] } },
        })

        console.log('Purged:', summary)
        console.log(`AR open items after: ${arAfter}, remaining seed journals: ${journalsAfter}`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})