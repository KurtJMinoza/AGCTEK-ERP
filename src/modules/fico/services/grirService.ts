import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from '@/modules/sd/services/apiError'

const BASE = '/fico/grir'

export type GrIrWorkbenchRow = {
    id: string
    goodsReceiptNumber: string
    poNumber: string | null
    supplier?: { supplierCode: string; supplierName: string }
    material?: { materialCode: string; materialName: string }
    currencyCode: string
    receivedQuantity: string
    invoicedQuantity: string
    outstandingAmount: string
    status: string
    reconciliationStatus: string
    agingDays: number
    goodsReceiptJournalEntryId: string | null
    lastInvoiceJournalEntryId: string | null
}

export type GrIrWorkbenchResponse = {
    companyId: string
    asOfDate: string
    summary: {
        openLineCount: number
        fullyMatchedCount: number
        grNotInvoicedCount: number
        blockedInvoiceCount: number
        invoiceBeforeReceiptCount: number
        outstandingAmount: string
    }
    items: GrIrWorkbenchRow[]
    glReconciliation: {
        grirGlBalance: string
        expectedGrIrBalance: string
        variance: string
        reconciled: boolean
    }
}

export const grirService = {
    async fetchWorkbench(params: {
        companyId: string
        supplierId?: string
        outstandingOnly?: boolean
        backfill?: boolean
        reconciliationStatus?: string
    }) {
        try {
            const search = new URLSearchParams()
            for (const [key, value] of Object.entries(params)) {
                if (value === undefined || value === null || value === '') continue
                search.set(key, String(value))
            }
            const { data } = await ErpAxiosBase.get<GrIrWorkbenchResponse>(
                `${BASE}/workbench?${search.toString()}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load GR/IR workbench')
        }
    },
}