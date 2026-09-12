import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/traceability'

export type TraceChainNode = {
    id: string
    transactionNumber: string
    postingDate: string
    movementType: string
    quantity: unknown
    signedQuantity?: unknown
    stockStatus: string
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    material?: { materialCode?: string; materialName?: string } | null
    warehouse?: { code?: string; name?: string } | null
    batch?: { batchNumber?: string; expiryDate?: string | null } | null
    serialNumber?: { serialNumber?: string } | null
    storageBin?: { binCode?: string } | null
}

export const traceabilityService = {
    getBatch: (id: string) =>
        ErpAxiosBase.get(`${BASE}/batches/${id}`).then((r) => r.data),

    batchForward: (id: string) =>
        ErpAxiosBase.get<{ batchId: string; direction: string; chain: TraceChainNode[] }>(
            `${BASE}/batches/${id}/forward`,
        ).then((r) => r.data),

    batchBackward: (id: string) =>
        ErpAxiosBase.get<{ batchId: string; direction: string; chain: TraceChainNode[] }>(
            `${BASE}/batches/${id}/backward`,
        ).then((r) => r.data),

    batchWhereUsed: (id: string) =>
        ErpAxiosBase.get<{ batchId: string; whereUsed: any[] }>(
            `${BASE}/batches/${id}/where-used`,
        ).then((r) => r.data),

    getSerial: (id: string) =>
        ErpAxiosBase.get<{ serial: any; history: TraceChainNode[] }>(
            `${BASE}/serials/${id}`,
        ).then((r) => r.data),
}
