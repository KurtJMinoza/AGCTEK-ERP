import type { PrismaClient } from '@prisma/client'

/** Remove inventory txns (+ valuation, cost layers, audit) for the given root txn ids. */
export async function purgeInventoryTransactions(
    prisma: PrismaClient,
    rootTxnIds: string[],
) {
    if (!rootTxnIds.length) return

    const allIds = new Set<string>(rootTxnIds)
    for (const id of rootTxnIds) {
        const reversals = await prisma.mmInventoryTransaction.findMany({
            where: { reversalOfId: id },
            select: { id: true },
        })
        for (const r of reversals) allIds.add(r.id)
    }
    const ids = [...allIds]

    const valTxns = await prisma.mmInventoryValuationTransaction.findMany({
        where: { inventoryTxnId: { in: ids } },
        select: { id: true, reversalOfId: true },
    })
    const valIds = valTxns.map((v) => v.id)
    if (valIds.length) {
        await prisma.mmInventoryValuationTransaction.deleteMany({
            where: { OR: [{ id: { in: valIds } }, { reversalOfId: { in: valIds } }] },
        })
    }

    await prisma.mmCostLayer.deleteMany({ where: { receiptTxnId: { in: ids } } })
    await prisma.mmInventoryAudit.deleteMany({ where: { transactionId: { in: ids } } })
    await prisma.mmInventoryTransaction.deleteMany({
        where: { OR: [{ id: { in: ids } }, { reversalOfId: { in: ids } }] },
    })
}
