import type { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { purgeInventoryTransactions } from './delete-inventory-ledger'

/** Hard-delete a goods receipt and dependents (draft/cancelled only). */
export async function hardDeleteGoodsReceiptByNumber(
    prisma: PrismaClient,
    documentNumber: string,
    opts?: { allowPosted?: boolean },
): Promise<boolean> {
    const gr = await prisma.mmGoodsReceipt.findUnique({
        where: { documentNumber },
        include: { lines: { select: { id: true } } },
    })
    if (!gr) {
        console.log(`  GR not found: ${documentNumber}`)
        return false
    }
    if (gr.status === 'POSTED' && !opts?.allowPosted) {
        throw new Error(
            `Cannot delete ${documentNumber}: status is POSTED. Reverse the GR first.`,
        )
    }

    await hardDeleteGoodsReceiptByNumberInternal(prisma, gr)
    console.log(`  Deleted ${documentNumber} (${gr.status})`)
    return true
}

/** Reverse ledger effects and hard-delete a POSTED (or any) goods receipt. */
export async function purgePostedGoodsReceiptAndDelete(
    prisma: PrismaClient,
    documentNumber: string,
): Promise<boolean> {
    const gr = await prisma.mmGoodsReceipt.findUnique({
        where: { documentNumber },
        include: { lines: true },
    })
    if (!gr) {
        console.log(`  GR not found: ${documentNumber}`)
        return false
    }

    const rootTxns = await prisma.mmInventoryTransaction.findMany({
        where: { sourceDocumentId: gr.id, sourceDocumentType: 'GOODS_RECEIPT' },
        select: { id: true },
    })
    await purgeInventoryTransactions(
        prisma,
        rootTxns.map((t) => t.id),
    )

    for (const line of gr.lines) {
        await prisma.mmInventoryBalance.deleteMany({
            where: {
                materialId: line.materialId,
                ...(line.batchId ? { batchId: line.batchId } : {}),
                ...(line.serialNumberId ? { serialNumberId: line.serialNumberId } : {}),
            },
        })
    }

    if (gr.purchaseOrderId) {
        for (const line of gr.lines) {
            if (!line.purchaseOrderLineId) continue
            const poLine = await prisma.mmPurchaseOrderLine.findUnique({
                where: { id: line.purchaseOrderLineId },
            })
            if (!poLine) continue
            const nextQty = new Decimal(poLine.receivedQuantity).minus(line.quantity)
            await prisma.mmPurchaseOrderLine.update({
                where: { id: poLine.id },
                data: {
                    receivedQuantity: nextQty.lt(0) ? new Decimal(0) : nextQty,
                },
            })
        }
        const po = await prisma.mmPurchaseOrder.findUnique({
            where: { id: gr.purchaseOrderId },
            include: { lines: true },
        })
        if (po) {
            const any = po.lines.some((l) => Number(l.receivedQuantity) > 0)
            const status = any ? 'PARTIALLY_RECEIVED' : 'SENT'
            await prisma.mmPurchaseOrder.update({
                where: { id: po.id },
                data: { status },
            })
        }
    }

    return hardDeleteGoodsReceiptByNumber(prisma, documentNumber, { allowPosted: true })
}

async function hardDeleteGoodsReceiptByNumberInternal(
    prisma: PrismaClient,
    gr: { id: string; status: string; receivingDocumentId: string | null; lines: { id: string }[] },
) {
    const lineIds = gr.lines.map((l) => l.id)

    await prisma.$transaction(async (tx) => {
        await tx.wmPutawayTask.deleteMany({
            where: {
                OR: [
                    { goodsReceiptId: gr.id },
                    ...(lineIds.length ? [{ goodsReceiptLineId: { in: lineIds } }] : []),
                ],
            },
        })

        const qis = await tx.mmQualityInspection.findMany({
            where: { goodsReceiptId: gr.id },
            select: { id: true },
        })
        for (const qi of qis) {
            await tx.mmQualityInspectionLine.deleteMany({ where: { inspectionId: qi.id } })
        }
        await tx.mmQualityInspection.deleteMany({ where: { goodsReceiptId: gr.id } })
        await tx.mmInspectionLot.deleteMany({ where: { goodsReceiptId: gr.id } })

        if (lineIds.length) {
            await tx.mmQualityInspectionLine.deleteMany({
                where: { goodsReceiptLineId: { in: lineIds } },
            })
        }

        await tx.mmSupplierReturnLine.deleteMany({
            where: { goodsReceiptLineId: { in: lineIds } },
        })

        if (gr.receivingDocumentId) {
            await tx.mmReceivingVariance.deleteMany({
                where: { receivingDocumentId: gr.receivingDocumentId },
            })
            await tx.mmReceivingLine.deleteMany({
                where: { receivingDocumentId: gr.receivingDocumentId },
            })
            await tx.mmReceivingDocument.delete({
                where: { id: gr.receivingDocumentId },
            })
        }

        await tx.mmGoodsReceiptLine.updateMany({
            where: { id: { in: lineIds } },
            data: { batchId: null, serialNumberId: null },
        })
        await tx.mmGoodsReceiptLine.deleteMany({ where: { receiptId: gr.id } })
        await tx.mmGoodsReceipt.delete({ where: { id: gr.id } })
    })
}

export async function hardDeleteGoodsReceiptsByNumbers(
    prisma: PrismaClient,
    documentNumbers: string[],
) {
    let deleted = 0
    for (const num of documentNumbers) {
        if (await hardDeleteGoodsReceiptByNumber(prisma, num)) deleted++
    }
    console.log(`Done: ${deleted}/${documentNumbers.length} goods receipt(s) removed.`)
}
