import type { SupplierInvoice } from '../types'
import type { SupplierInvoiceSlipData } from '../components/SupplierInvoiceSlip'
import {
    companyFromApi,
    supplierPartyFromApi,
} from '@/modules/mm/shared/documentSlipUtils'

export function supplierInvoiceToSlip(inv: SupplierInvoice): SupplierInvoiceSlipData {
    const currency = inv.currency?.code
    return {
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        matchStatus: inv.matchStatus,
        paymentEligible: inv.paymentEligible,
        invoiceDate: inv.invoiceDate,
        postingDate: inv.postingDate,
        supplier: inv.supplier?.supplierName,
        supplierCode: inv.supplier?.supplierCode,
        poNumber: inv.purchaseOrder?.poNumber,
        currency,
        company: companyFromApi(inv.company),
        party: supplierPartyFromApi(inv.supplier),
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
