import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MmSupplierQuotation,
    MmQuotationListResponse,
    MmQuotationQueryParams,
} from '../types'

const BASE = '/mm/supplier-quotations'

export const quotationService = {
    list: (params?: MmQuotationQueryParams) =>
        ErpAxiosBase.get<MmQuotationListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<MmSupplierQuotation>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmSupplierQuotation>(BASE, data).then((r) => r.data),

    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<MmSupplierQuotation>(`${BASE}/${id}`, data).then((r) => r.data),

    submit: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmSupplierQuotation>(`${BASE}/${id}/submit`, { performedBy }).then(
            (r) => r.data,
        ),

    withdraw: (id: string) =>
        ErpAxiosBase.post<MmSupplierQuotation>(`${BASE}/${id}/withdraw`, {}).then((r) => r.data),

    updateScores: (
        id: string,
        data: { qualityScore?: number; supplierScore?: number },
    ) =>
        ErpAxiosBase.put<MmSupplierQuotation>(`${BASE}/${id}/scores`, data).then((r) => r.data),
}
