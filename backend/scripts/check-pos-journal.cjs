const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const orderId = 'cmwx76i9o00nmosss6fpju0r6'
async function main() {
    const journals = await p.ficoJournalEntry.findMany({
        where: {
            OR: [
                { idempotencyKey: `pos-revenue:${orderId}` },
                { sourceDocumentId: orderId },
            ],
        },
        include: {
            lines: {
                orderBy: { lineNumber: 'asc' },
                include: { glAccount: { select: { accountCode: true, accountName: true } } },
            },
        },
    })
    console.log('journals', journals.length)
    for (const j of journals) {
        console.log({
            id: j.id,
            doc: j.documentNumber,
            type: j.documentType,
            status: j.status,
            idempotencyKey: j.idempotencyKey,
            total: j.totalAmount.toString(),
        })
        for (const l of j.lines) {
            console.log(
                `  ${l.lineNumber} ${l.glAccount.accountCode} ${l.glAccount.accountName} Dr ${l.debitAmount} Cr ${l.creditAmount}`,
            )
        }
    }
    const gi = await p.mmGoodsIssue.findMany({
        where: { sourceDocumentId: orderId },
        select: { id: true, sourceDocumentType: true, status: true },
    })
    console.log('goods issues', gi)
    if (gi.length) {
        const invJ = await p.ficoJournalEntry.findMany({
            where: { sourceDocumentId: { in: gi.map((g) => g.id) } },
            include: {
                lines: {
                    include: { glAccount: { select: { accountCode: true } } },
                },
            },
        })
        console.log('inventory journals', invJ.map((j) => ({
            doc: j.documentNumber,
            lines: j.lines.map((l) => `${l.glAccount.accountCode} Dr${l.debitAmount} Cr${l.creditAmount}`),
        })))
    }
    const ar = await p.ficoArDocument.findFirst({
        where: { sourceSalesOrderId: orderId },
        include: { openItem: true },
    })
    console.log('ar', ar)
    const ev = await p.mmAccountingEvent.findFirst({
        where: { idempotencyKey: `pos-revenue:${orderId}` },
    })
    console.log('event journalEntryId', ev?.journalEntryId)
}
main().finally(() => p.$disconnect())