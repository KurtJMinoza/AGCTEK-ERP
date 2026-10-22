import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import type { MmExpectedReceipt } from '../types'
import type { ReceivingReceiptSlipData } from '../components/ReceivingReceiptSlip'
import {
    companyFromApi,
    supplierPartyFromApi,
} from '@/modules/mm/shared/documentSlipUtils'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'

function materialLineLabel(m?: {
    materialCode?: string
    materialName?: string
    name?: string
    code?: string
}) {
    return {
        materialCode: m?.materialCode ?? m?.code,
        materialName: m?.materialName ?? m?.name,
    }
}

export function goodsReceiptToSlip(gr: GoodsReceipt): ReceivingReceiptSlipData {
    return {
        kind: 'GOODS_RECEIPT',
        documentNumber: gr.documentNumber,
        status: gr.status,
        postingDate: gr.postingDate,
        documentDate: gr.documentDate,
        warehouse: gr.warehouse?.name,
        supplier: gr.supplier?.supplierName ?? gr.supplier?.name,
        poNumber: gr.purchaseOrder?.poNumber,
        stockStatus: gr.stockStatus,
        remarks: gr.remarks ?? undefined,
        company: companyFromApi(gr.company, AWIC_BRAND.fullName),
        party: supplierPartyFromApi(gr.supplier),
        lines: (gr.lines ?? []).map((l) => ({
            ...materialLineLabel(l.material),
            quantity: l.quantity,
            uom: l.uom?.code,
            note: l.discrepancyFlag ? `Variance: ${l.discrepancyFlag}` : undefined,
        })),
    }
}

export function expectedReceiptToSlip(er: MmExpectedReceipt): ReceivingReceiptSlipData {
    return {
        kind: 'EXPECTED_RECEIPT',
        documentNumber: er.documentNumber,
        status: er.status,
        expectedDate: er.expectedDate ?? undefined,
        warehouse: er.warehouse?.name,
        supplier: er.supplier?.supplierName,
        poNumber: er.purchaseOrder?.poNumber,
        remarks: er.remarks ?? undefined,
        company: companyFromApi(er.company, AWIC_BRAND.fullName),
        party: supplierPartyFromApi(er.supplier),
        lines: (er.lines ?? []).map((l) => ({
            materialCode: l.material?.materialCode,
            materialName: l.material?.materialName,
            quantity: l.expectedQuantity,
            uom: l.uom?.code,
            note: `Rcvd ${Number(l.receivedQuantity)} · ${l.status}`,
        })),
    }
}
