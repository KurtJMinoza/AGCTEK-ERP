import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CreateAsnPayload,
    CreateErFromAsnPayload,
    CreateErFromPoPayload,
    InboundListResponse,
    InboundQueryParams,
    MmAsn,
    MmExpectedReceipt,
    MmQualityInspection,
    QualityDecidePayload,
    ReceivePayload,
} from '../types'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'

const BASE = '/mm/inbound'

export const inboundService = {
    // ── ASN ─────────────────────────────────────────────────────────
    listAsns: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmAsn>>(`${BASE}/asns`, { params }).then(
            (r) => r.data,
        ),

    getAsn: (id: string) =>
        ErpAxiosBase.get<MmAsn>(`${BASE}/asns/${id}`).then((r) => r.data),

    createAsn: (data: CreateAsnPayload) =>
        ErpAxiosBase.post<MmAsn>(`${BASE}/asns`, data).then((r) => r.data),

    confirmAsn: (id: string) =>
        ErpAxiosBase.post<MmAsn>(`${BASE}/asns/${id}/confirm`).then((r) => r.data),

    cancelAsn: (id: string) =>
        ErpAxiosBase.post<MmAsn>(`${BASE}/asns/${id}/cancel`).then((r) => r.data),

    // ── Expected receipts ───────────────────────────────────────────
    listExpectedReceipts: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmExpectedReceipt>>(
            `${BASE}/expected-receipts`,
            { params },
        ).then((r) => r.data),

    getExpectedReceipt: (id: string) =>
        ErpAxiosBase.get<MmExpectedReceipt>(`${BASE}/expected-receipts/${id}`).then(
            (r) => r.data,
        ),

    createExpectedFromPo: (data: CreateErFromPoPayload) =>
        ErpAxiosBase.post<MmExpectedReceipt>(
            `${BASE}/expected-receipts/from-po`,
            data,
        ).then((r) => r.data),

    createExpectedFromAsn: (data: CreateErFromAsnPayload) =>
        ErpAxiosBase.post<MmExpectedReceipt>(
            `${BASE}/expected-receipts/from-asn`,
            data,
        ).then((r) => r.data),

    // ── Receiving ───────────────────────────────────────────────────
    receive: (data: ReceivePayload & { autoPost?: boolean }) =>
        ErpAxiosBase.post<GoodsReceipt>(`${BASE}/receiving`, data).then((r) => r.data),

    // ── Quality ─────────────────────────────────────────────────────
    listQualityInspections: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmQualityInspection>>(
            `${BASE}/quality-inspections`,
            { params },
        ).then((r) => r.data),

    getQualityInspection: (id: string) =>
        ErpAxiosBase.get<MmQualityInspection>(
            `${BASE}/quality-inspections/${id}`,
        ).then((r) => r.data),

    decideQualityInspection: (id: string, data: QualityDecidePayload) =>
        ErpAxiosBase.post<MmQualityInspection>(
            `${BASE}/quality-inspections/${id}/decide`,
            data,
        ).then((r) => r.data),
}
