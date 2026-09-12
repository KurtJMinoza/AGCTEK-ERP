import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    InboundListResponse,
    InboundQueryParams,
    MmGrRef,
    MmReceivingDocument,
    MmReceivingVariance,
    ReceivingActionPayload,
    CreateReceivingDocumentPayload,
} from '../types'

const BASE = '/mm/receiving'

export const receivingService = {
    list: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmReceivingDocument>>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<MmReceivingDocument>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateReceivingDocumentPayload) =>
        ErpAxiosBase.post<MmReceivingDocument | { receivingDocument: MmReceivingDocument; goodsReceipt: MmGrRef }>(
            BASE,
            data,
        ).then((r) => r.data),

    validate: (id: string, data?: ReceivingActionPayload) =>
        ErpAxiosBase.post<MmReceivingDocument>(`${BASE}/${id}/validate`, data ?? {}).then(
            (r) => r.data,
        ),

    post: (id: string, data?: ReceivingActionPayload) =>
        ErpAxiosBase.post<{ receivingDocument: MmReceivingDocument; goodsReceipt: MmGrRef }>(
            `${BASE}/${id}/post`,
            data ?? {},
        ).then((r) => r.data),

    cancel: (id: string, data?: ReceivingActionPayload) =>
        ErpAxiosBase.post<MmReceivingDocument>(`${BASE}/${id}/cancel`, data ?? {}).then(
            (r) => r.data,
        ),

    listVariances: (params?: InboundQueryParams & { varianceType?: string }) =>
        ErpAxiosBase.get<InboundListResponse<MmReceivingVariance>>(`${BASE}/variances`, {
            params,
        }).then((r) => r.data),
}
