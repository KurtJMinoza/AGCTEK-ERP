import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MmRfq,
    MmRfqListResponse,
    MmRfqQueryParams,
    MmRfqAudit,
    RfqComparisonResponse,
} from '../types'

const BASE = '/mm/rfqs'

export const rfqService = {
    list: (params?: MmRfqQueryParams) =>
        ErpAxiosBase.get<MmRfqListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<MmRfq>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmRfq>(BASE, data).then((r) => r.data),

    createFromPr: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/from-pr`, data).then((r) => r.data),

    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<MmRfq>(`${BASE}/${id}`, data).then((r) => r.data),

    inviteSuppliers: (id: string, supplierIds: string[], performedBy?: string) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/invite-suppliers`, {
            supplierIds,
            performedBy,
        }).then((r) => r.data),

    issue: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/issue`, { performedBy }).then((r) => r.data),

    startEvaluation: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/start-evaluation`, { performedBy }).then(
            (r) => r.data,
        ),

    getComparison: (id: string) =>
        ErpAxiosBase.get<RfqComparisonResponse>(`${BASE}/${id}/comparison`).then((r) => r.data),

    award: (
        id: string,
        data: {
            quotationId?: string
            supplierId?: string
            reason: string
            evaluatedBy?: string
            useCheapest?: boolean
        },
    ) => ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/award`, data).then((r) => r.data),

    close: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/close`, { performedBy }).then((r) => r.data),

    cancel: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmRfq>(`${BASE}/${id}/cancel`, { performedBy }).then((r) => r.data),

    getAudit: (id: string) =>
        ErpAxiosBase.get<MmRfqAudit[]>(`${BASE}/${id}/audit`).then((r) => r.data),
}
