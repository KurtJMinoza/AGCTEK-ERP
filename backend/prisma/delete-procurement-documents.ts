import type { PrismaClient } from '@prisma/client'

/** Hard-delete a PO and dependent rows (no posted GR). */
export async function deletePurchaseOrderByNumber(
    prisma: PrismaClient,
    poNumber: string,
): Promise<boolean> {
    const po = await prisma.mmPurchaseOrder.findUnique({
        where: { poNumber },
        include: { lines: true },
    })
    if (!po) {
        console.log(`  PO not found: ${poNumber}`)
        return false
    }

    const postedGr = await prisma.mmGoodsReceipt.count({
        where: { purchaseOrderId: po.id, status: 'POSTED' },
    })
    if (postedGr > 0) {
        throw new Error(
            `Cannot delete ${poNumber}: ${postedGr} posted goods receipt(s). Reverse GR first.`,
        )
    }

    await prisma.$transaction(async (tx) => {
        const invoices = await tx.mmSupplierInvoice.findMany({
            where: { purchaseOrderId: po.id },
            select: { id: true },
        })
        for (const inv of invoices) {
            const lines = await tx.mmSupplierInvoiceLine.findMany({
                where: { invoiceId: inv.id },
                select: { id: true },
            })
            for (const line of lines) {
                await tx.mmSupplierInvoiceLineReceipt.deleteMany({
                    where: { invoiceLineId: line.id },
                })
            }
            await tx.mmMatchException.deleteMany({ where: { invoiceId: inv.id } })
            await tx.mmSupplierInvoiceLine.deleteMany({ where: { invoiceId: inv.id } })
        }
        await tx.mmMatchException.deleteMany({ where: { purchaseOrderId: po.id } })
        await tx.mmSupplierInvoice.deleteMany({ where: { purchaseOrderId: po.id } })

        const draftGrs = await tx.mmGoodsReceipt.findMany({
            where: { purchaseOrderId: po.id },
            select: { id: true },
        })
        for (const gr of draftGrs) {
            const qis = await tx.mmQualityInspection.findMany({
                where: { goodsReceiptId: gr.id },
                select: { id: true },
            })
            for (const qi of qis) {
                await tx.mmQualityInspectionLine.deleteMany({ where: { inspectionId: qi.id } })
            }
            await tx.mmQualityInspection.deleteMany({ where: { goodsReceiptId: gr.id } })
            await tx.mmInspectionLot.deleteMany({ where: { goodsReceiptId: gr.id } })
            await tx.mmGoodsReceiptLine.deleteMany({ where: { receiptId: gr.id } })
            await tx.mmGoodsReceipt.delete({ where: { id: gr.id } })
        }

        await tx.mmInspectionLot.deleteMany({ where: { purchaseOrderId: po.id } })

        const receivingDocs = await tx.mmReceivingDocument.findMany({
            where: { purchaseOrderId: po.id },
            select: { id: true },
        })
        for (const rd of receivingDocs) {
            await tx.mmReceivingVariance.deleteMany({ where: { receivingDocumentId: rd.id } })
            await tx.mmReceivingLine.deleteMany({ where: { receivingDocumentId: rd.id } })
            await tx.mmReceivingDocument.delete({ where: { id: rd.id } })
        }

        const ers = await tx.mmExpectedReceipt.findMany({
            where: { purchaseOrderId: po.id },
            select: { id: true },
        })
        for (const er of ers) {
            await tx.mmExpectedReceiptLine.deleteMany({ where: { expectedReceiptId: er.id } })
            await tx.mmExpectedReceipt.delete({ where: { id: er.id } })
        }

        const asns = await tx.mmAsn.findMany({
            where: { purchaseOrderId: po.id },
            select: { id: true },
        })
        for (const asn of asns) {
            await tx.mmAsnLine.deleteMany({ where: { asnId: asn.id } })
            await tx.mmAsn.delete({ where: { id: asn.id } })
        }

        await tx.mmPrConversion.deleteMany({
            where: { targetType: 'PURCHASE_ORDER', targetId: po.id },
        })

        if (po.workflowInstanceId) {
            await tx.mmApprovalTask.deleteMany({
                where: { instanceId: po.workflowInstanceId },
            })
            await tx.mmWorkflowInstance.delete({ where: { id: po.workflowInstanceId } })
        }

        await tx.mmPurchaseContract.updateMany({
            where: { purchaseOrderId: po.id },
            data: { purchaseOrderId: null },
        })

        await tx.mmPurchaseOrder.update({
            where: { id: po.id },
            data: {
                workflowInstanceId: null,
                contractReleaseId: null,
                purchaseRequisitionId: null,
                rfqId: null,
                quotationId: null,
                awardId: null,
            },
        })

        await tx.mmPurchaseOrder.delete({ where: { id: po.id } })
    })

    console.log(`  Deleted PO ${poNumber}`)
    return true
}

/** Hard-delete a PR and dependent rows (PO must be removed or unlinked first). */
export async function deletePurchaseRequisitionByNumber(
    prisma: PrismaClient,
    requisitionNumber: string,
): Promise<boolean> {
    const pr = await prisma.mmPurchaseRequisition.findUnique({
        where: { requisitionNumber },
    })
    if (!pr) {
        console.log(`  PR not found: ${requisitionNumber}`)
        return false
    }

    const poCount = await prisma.mmPurchaseOrder.count({
        where: { purchaseRequisitionId: pr.id },
    })
    if (poCount > 0) {
        throw new Error(
            `Cannot delete ${requisitionNumber}: ${poCount} purchase order(s) still linked. Delete PO first.`,
        )
    }

    await prisma.$transaction(async (tx) => {
        await tx.mmRfq.updateMany({
            where: { purchaseRequisitionId: pr.id },
            data: { purchaseRequisitionId: null },
        })

        await tx.mmProcurementSuggestion.updateMany({
            where: { purchaseRequisitionId: pr.id },
            data: { purchaseRequisitionId: null },
        })

        await tx.mmPlannedOrder.updateMany({
            where: { purchaseRequisitionId: pr.id },
            data: { purchaseRequisitionId: null },
        })

        await tx.mmPrConversion.deleteMany({ where: { requisitionId: pr.id } })
        await tx.mmPurchaseRequisitionAudit.deleteMany({ where: { requisitionId: pr.id } })

        if (pr.workflowInstanceId) {
            await tx.mmApprovalTask.deleteMany({
                where: { instanceId: pr.workflowInstanceId },
            })
            await tx.mmWorkflowInstance.delete({ where: { id: pr.workflowInstanceId } })
        }

        await tx.mmPurchaseRequisitionLine.deleteMany({ where: { requisitionId: pr.id } })
        await tx.mmPurchaseRequisition.delete({ where: { id: pr.id } })
    })

    console.log(`  Deleted PR ${requisitionNumber}`)
    return true
}
