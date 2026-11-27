import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    GoodsIssue,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/goods-issues'

export type GoodsIssueAccountingLine = {
    lineNumber: number
    glAccountId: string
    accountCode: string | null
    accountName: string | null
    debit: number
    credit: number
    description: string | null
}

export type GoodsIssueAccountingJournal = {
    id: string
    documentNumber: string | null
    status: string
    documentType: string
    documentTypeCode: string | null
    documentTypeName: string | null
    postingDate: string
    currencyCode: string
    sourceModule: string | null
    sourceDocumentType: string | null
    sourceDocumentId: string | null
    mmAccountingEventId: string | null
    headerText: string | null
    lines: GoodsIssueAccountingLine[]
}

export type GoodsIssueAccountingEvent = {
    id: string
    eventType: string
    sourceModule: string
    documentType: string
    documentId: string
    status: string
    lastError: string | null
    journalEntryId: string | null
    createdAt: string
    consumedAt: string | null
}

export type GoodsIssueAccounting = {
    goodsIssueId: string
    documentNumber: string
    journals: GoodsIssueAccountingJournal[]
    events: GoodsIssueAccountingEvent[]
}

export const goodsIssueService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<GoodsIssue>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<GoodsIssue>(`${BASE}/${id}`).then((r) => r.data),

    getAccounting: (id: string) =>
        ErpAxiosBase.get<GoodsIssueAccounting>(
            `${BASE}/${encodeURIComponent(id)}/accounting`,
        ).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<GoodsIssue>(BASE, data).then((r) => r.data),

    verifySupervisor: (
        id: string,
        data: {
            verifiedBy: string
            sourceDocumentReference: string
            verificationNotes?: string
        },
    ) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/verify-supervisor`, data).then(
            (r) => r.data,
        ),

    post: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/post`).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/cancel`).then((r) => r.data),

    reverse: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/reverse`).then((r) => r.data),
}
