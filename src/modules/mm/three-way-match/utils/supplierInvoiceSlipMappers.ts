import type { SupplierInvoice } from '../types'
import type { SupplierInvoiceSlipData } from '../components/SupplierInvoiceSlip'

export function supplierInvoiceToSlip(inv: SupplierInvoice): SupplierInvoiceSlipData {
    const currency = inv.currency?.code
    return {
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        matchStatus: inv.matchStatus,
        paymentEligible: inv.paymentEligible,
        invoiceDate: inv.invoiceDate,
        postingDate: inv.postingDate,
        supplier: inv.supplier
            ? `${inv.supplier.supplierCode} — ${inv.supplier.supplierName}`
            : inv.supplierId,
        poNumber: inv.purchaseOrder?.poNumber,
        currency,
        totalAmount: inv.totalAmount,
        taxAmount: inv.taxAmount,
        remarks: inv.remarks ?? undefined,
        lines: (inv.lines ?? []).map((l) => {
            const grDocs = (l.receipts ?? [])
                .map((r) => r.goodsReceiptLine?.receipt?.documentNumber)
                .filter(Boolean) as string[]
            return {
                materialCode: l.material?.materialCode,
                materialName: l.material?.materialName,
                quantity: l.invoicedQuantity,
                uom: l.uom?.code,
                unitPrice: l.unitPrice,
                lineTotal: l.lineTotal,
                taxAmount: l.taxAmount,
                grDocument: grDocs.length ? [...new Set(grDocs)].join(', ') : undefined,
            }
        }),
    }
}
