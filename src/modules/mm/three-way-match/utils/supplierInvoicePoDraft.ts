import { goodsReceiptService } from '@/modules/mm/inventory/services/goodsReceiptService'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import { purchaseOrderService } from '@/modules/mm/procurement/services/purchaseOrderService'
import {
    poInvoiceOpenQty,
    type MmPurchaseOrder,
    type MmPurchaseOrderLine,
} from '@/modules/mm/procurement/types'

export type SupplierInvoiceGrPick = { value: string; label: string; maxQty: number }

export type SupplierInvoicePoDraft = {
    po: MmPurchaseOrder
    openLines: MmPurchaseOrderLine[]
    grOpts: Record<string, SupplierInvoiceGrPick[]>
    invLines: Record<string, string>
    grLineId: Record<string, string>
    postedReceiptCount: number
}

function buildGrPicksForLine(
    line: MmPurchaseOrderLine,
    receipts: GoodsReceipt[],
): SupplierInvoiceGrPick[] {
    const picks: SupplierInvoiceGrPick[] = []
    for (const gr of receipts) {
        for (const gl of gr.lines ?? []) {
            if (gl.purchaseOrderLineId && gl.purchaseOrderLineId !== line.id) continue
            if (!gl.purchaseOrderLineId && gl.materialId !== line.materialId) continue
            picks.push({
                value: gl.id,
                label: `${gr.documentNumber} · ${gl.material?.materialCode ?? gl.materialId} · qty ${Number(gl.quantity)}`,
                maxQty: Number(gl.quantity),
            })
        }
    }
    return picks
}

/** Loads PO header/lines and posted GR options for supplier invoice capture. */
export async function loadSupplierInvoicePoDraft(
    purchaseOrderId: string,
): Promise<SupplierInvoicePoDraft> {
    const po = await purchaseOrderService.get(purchaseOrderId)
    const openLines = (po.lines ?? []).filter((l) => poInvoiceOpenQty(l) > 0)
    const grRes = await goodsReceiptService.list({
        purchaseOrderId: po.id,
        status: 'POSTED',
        pageSize: 100,
    })
    const receipts = (grRes.data ?? []) as GoodsReceipt[]
    const grOpts: Record<string, SupplierInvoiceGrPick[]> = {}
    const invLines: Record<string, string> = {}
    const grLineId: Record<string, string> = {}
    for (const l of openLines) {
        const open = poInvoiceOpenQty(l)
        invLines[l.id] = String(open)
        const picks = buildGrPicksForLine(l, receipts)
        grOpts[l.id] = picks
        grLineId[l.id] = picks[0]?.value ?? ''
    }
    return {
        po,
        openLines,
        grOpts,
        invLines,
        grLineId,
        postedReceiptCount: receipts.length,
    }
}

const INVOICE_PO_STATUSES = ['PARTIALLY_RECEIVED', 'FULLY_RECEIVED'] as const

/** PO headers that typically have received (and possibly uninvoiced) quantity. */
export async function listPurchaseOrdersForInvoicing(): Promise<MmPurchaseOrder[]> {
    const seen = new Set<string>()
    const merged: MmPurchaseOrder[] = []
    for (const status of INVOICE_PO_STATUSES) {
        const res = await purchaseOrderService.list({ page: 1, pageSize: 100, status })
        for (const p of res.data) {
            if (seen.has(p.id)) continue
            seen.add(p.id)
            merged.push(p)
        }
    }
    merged.sort((a, b) => String(b.poNumber).localeCompare(String(a.poNumber)))
    return merged
}

export async function resolvePurchaseOrderId(query: string): Promise<string> {
    const q = query.trim()
    if (!q) throw new Error('Enter a PO number or ID')
    const looksLikeUuid = q.length >= 32 && !q.includes(' ')
    if (looksLikeUuid) {
        await purchaseOrderService.get(q)
        return q
    }
    const list = await purchaseOrderService.list({ search: q, pageSize: 10 })
    const hit =
        list.data.find((p) => p.poNumber === q || p.id === q) ?? list.data[0]
    if (!hit?.id) throw new Error(`No purchase order matches "${q}"`)
    return hit.id
}
