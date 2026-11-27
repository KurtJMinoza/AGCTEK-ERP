/**
 * Backfill FICO AR subledger for approved EPT transactions that already have PS journals.
 *
 *   node scripts/attach-ext-platform-ar-subledger.cjs EPT-000807
 *   node scripts/attach-ext-platform-ar-subledger.cjs --all-pending
 */
const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const args = process.argv.slice(2)
const prisma = new PrismaClient()

function money(v) {
    return new Decimal(v?.toString?.() ?? v)
}

async function resolveCustomerId(tx) {
    if (tx.customerId) return tx.customerId
    if (tx.salesSource.counterpartyCustomerId) {
        return tx.salesSource.counterpartyCustomerId
    }
    const fallback = await prisma.sdCustomer.findFirst({
        where: { customerNumber: `MP-${tx.salesSource.code}` },
        select: { id: true },
    })
    if (fallback) return fallback.id
    throw new Error(
        `No customer for ${tx.transactionNumber}; set EPT customer or sales source counterparty.`,
    )
}

async function attachOne(tx) {
    const existing = await prisma.ficoArDocument.findUnique({
        where: { sourceExtPlatformTransactionId: tx.id },
    })
    if (existing) {
        console.log(`${tx.transactionNumber}: AR already attached (${existing.id})`)
        return
    }

    const journal = await prisma.ficoJournalEntry.findFirst({
        where: {
            companyId: tx.companyId,
            sourceDocumentId: tx.id,
            status: 'POSTED',
            documentType: { in: ['SD_REVENUE', 'JOURNAL'] },
            idempotencyKey: { startsWith: 'ext-platform-revenue:' },
        },
        include: {
            lines: {
                select: { glAccountId: true, debitAmount: true, creditAmount: true },
            },
        },
    })
    if (!journal) {
        console.log(`${tx.transactionNumber}: no revenue journal — skip`)
        return
    }

    const customerId = await resolveCustomerId(tx)
    const arLine = journal.lines.find((l) => money(l.debitAmount).gt(0))
    if (!arLine) throw new Error('No AR debit line on revenue journal')

    const receivableGl = await prisma.ficoGlAccount.findUnique({
        where: { id: arLine.glAccountId },
        select: { id: true, accountCode: true },
    })
    if (!receivableGl) throw new Error('Receivable GL missing')

    const grossAmount = money(tx.grandTotal)
    const taxAmount = (
        await prisma.sdExtPlatformTransactionLine.findMany({
            where: { transactionId: tx.id },
            select: { taxAmount: true },
        })
    ).reduce((s, l) => s.plus(l.taxAmount ?? 0), new Decimal(0))
    const netAmount = Decimal.max(grossAmount.minus(taxAmount), new Decimal(0))
    const postingDate = journal.postingDate
    const dueDate = new Date(postingDate)
    dueDate.setUTCDate(dueDate.getUTCDate() + 30)

    await prisma.$transaction(async (db) => {
        const document = await db.ficoArDocument.create({
            data: {
                companyId: tx.companyId,
                customerId,
                sourceExtPlatformTransactionId: tx.id,
                journalEntryId: journal.id,
                documentType: 'MARKETPLACE_SALE',
                status: 'POSTED',
                referenceNumber: tx.transactionNumber,
                documentDate: journal.documentDate ?? postingDate,
                postingDate,
                baselineDate: postingDate,
                dueDate,
                currencyCode: (tx.currency ?? 'PHP').toUpperCase(),
                netAmount,
                taxAmount,
                grossAmount,
                receivableAmount: grossAmount,
                reconciliationAccountId: receivableGl.id,
                reconciliationAccountCode: receivableGl.accountCode,
            },
        })
        await db.ficoArOpenItem.create({
            data: {
                companyId: tx.companyId,
                customerId,
                documentId: document.id,
                reconciliationAccountId: receivableGl.id,
                itemType: 'MARKETPLACE_RECEIVABLE',
                direction: 'DEBIT',
                originalAmount: grossAmount,
                openAmount: grossAmount,
                currencyCode: (tx.currency ?? 'PHP').toUpperCase(),
                baselineDate: postingDate,
                dueDate,
                status: 'OPEN',
            },
        })
        console.log(`${tx.transactionNumber}: AR attached ${document.id}`)
    })
}

async function main() {
    const where =
        args[0] === '--all-pending'
            ? {
                  status: 'APPROVED',
                  ficoArDocument: null,
              }
            : { transactionNumber: { in: args } }

    const txs = await prisma.sdExtPlatformTransaction.findMany({
        where,
        include: {
            salesSource: {
                select: { code: true, counterpartyCustomerId: true },
            },
        },
    })
    if (!txs.length) {
        console.log('No transactions matched.')
        return
    }
    for (const tx of txs) {
        await attachOne(tx)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())