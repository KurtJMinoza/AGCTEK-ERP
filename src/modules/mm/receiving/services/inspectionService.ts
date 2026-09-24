import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    InboundListResponse,
    InboundQueryParams,
    MmInspectionLot,
    RecordInspectionResultsPayload,
    UsageDecisionPayload,
} from '../types'

const BASE = '/mm/inspection-lots'

export const inspectionService = {
    list: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmInspectionLot>>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<MmInspectionLot>(`${BASE}/${id}`).then((r) => r.data),

    recordResults: (id: string, data: RecordInspectionResultsPayload) =>
        ErpAxiosBase.post<MmInspectionLot>(`${BASE}/${id}/results`, data).then((r) => r.data),

    usageDecision: (id: string, data: UsageDecisionPayload) =>
        ErpAxiosBase.post<{ lot: MmInspectionLot; decision: unknown }>(
            `${BASE}/${id}/usage-decision`,
            data,
        ).then((r) => r.data),

    start: (id: string, data?: { inspector?: string }) =>
        ErpAxiosBase.post(`${BASE}/${id}/start`, data ?? {}).then((r) => r.data),

    complete: (id: string, data?: { completedBy?: string; remarks?: string }) =>
        ErpAxiosBase.post(`${BASE}/${id}/complete`, data ?? {}).then((r) => r.data),
}
