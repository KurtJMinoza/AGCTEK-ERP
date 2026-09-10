import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/procurement/history'

export type ProcurementHistoryRow = {
    id: string
    poId: string
    poNumber: string
    poStatus: string
    date: string
    expectedDeliveryDate?: string | null
    buyerId: string
    company?: { id: string; name: string; code: string }
    supplier?: {
        id: string
        supplierCode: string
        supplierName: string
    }
    material?: {
        id: string
        materialCode: string
        materialName: string
    }
    uom?: { id: string; code: string }
    quantity: number
    unitPrice: number
    lineTotal: number
}

export const procurementHistoryService = {
    search: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{
            data: ProcurementHistoryRow[]
            meta: {
                total: number
                page: number
                pageSize: number
                totalPages: number
            }
        }>(BASE, { params }).then((r) => r.data),
}
