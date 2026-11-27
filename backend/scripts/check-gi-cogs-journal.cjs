const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const GI_NUMBER = process.argv[2] || 'GI-20261126-00001'

async function main() {
    const gi = await p.mmGoodsIssue.findFirst({
        where: {
            OR: [
                { documentNumber: GI_NUMBER },
                { id: GI_NUMBER },
            ],
        },
        select: {
            id: true,
            documentNumber: true,
            status: true,
            sourceDocumentType: true,
            sourceDocumentId: true,
            accountingPostingStatus: true,
            postingDate: true,
            companyId: true,
            issuePurpose: true,
            lines: {
                select: {
                    quantity: true,
                    unitCost: true,
                    totalCost: true,
                },
            },
        },
    })
    console.log('goodsIssue', gi)
    if (!gi) return
    if (gi.companyId) {
        const settings = await p.ficoCompanyAccountingSettings.findFirst({
            where: { companyId: gi.companyId },
            select: {
                defaultCostOfGoodsSoldAccountId: true,
                defaultInventoryAccountId: true,
                mmResolutionMode: true,
            },
        })
        console.log('companyGlDefaults', settings)
    }
    const lineCost = (gi.lines ?? []).reduce(
        (sum, row) =>
            sum +
            Number(
                row.totalCost ??
                    Number(row.unitCost ?? 0) * Number(row.quantity ?? 1),
            ),
        0,
    )
    console.log('giLineCostTotal', lineCost.toFixed(2))

    const events = await p.mmAccountingEvent.findMany({
        where: {
            OR: [
                { documentId: gi.id },
                { idempotencyKey: { contains: gi.id } },
            ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            eventType: true,
            status: true,
            journalEntryId: true,
            lastError: true,
            idempotencyKey: true,
        },
    })
    console.log('accountingEvents', events)

    const journals = await p.ficoJournalEntry.findMany({
        where: {
            OR: [
                { sourceDocumentId: gi.id },
                ...(events.map((e) => e.journalEntryId).filter(Boolean).map((id) => ({ id }))),
            ],
        },
        include: {
            lines: {
                orderBy: { lineNumber: 'asc' },
                include: {
                    glAccount: {
                        select: { accountCode: true, accountName: true },
                    },
                },
            },
        },
    })
    console.log('journalCount', journals.length)
    for (const j of journals) {
        console.log({
            id: j.id,
            documentNumber: j.documentNumber,
            documentType: j.documentType,
            status: j.status,
            idempotencyKey: j.idempotencyKey,
            total: j.totalAmount?.toString?.() ?? j.totalAmount,
        })
        let dr = 0
        let cr = 0
        for (const line of j.lines) {
            const d = Number(line.debitAmount)
            const c = Number(line.creditAmount)
            dr += d
            cr += c
            console.log(
                `  ${line.glAccount.accountCode} ${line.glAccount.accountName} Dr ${d.toFixed(2)} Cr ${c.toFixed(2)}`,
            )
        }
        console.log(`  TOTAL Dr ${dr.toFixed(2)} Cr ${cr.toFixed(2)}`)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())