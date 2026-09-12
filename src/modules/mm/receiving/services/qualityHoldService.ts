import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CreateQualityHoldPayload,
    InboundListResponse,
    InboundQueryParams,
    MmQualityHold,
    ReleaseQualityHoldPayload,
} from '../types'

const BASE = '/mm/quality-holds'

export const qualityHoldService = {
    list: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmQualityHold>>(BASE, { params }).then(
            (r) => r.data,
        ),

    create: (data: CreateQualityHoldPayload) =>
        ErpAxiosBase.post<MmQualityHold>(BASE, data).then((r) => r.data),

    release: (id: string, data: ReleaseQualityHoldPayload) =>
        ErpAxiosBase.post<MmQualityHold>(`${BASE}/${id}/release`, data).then((r) => r.data),
}
