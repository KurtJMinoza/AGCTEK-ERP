import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/warehouse-rules'

export type PutawayRule = {
    id: string
    warehouseId: string
    code: string
    name: string
    strategyCode: string
    priority: number
    storageTypeId?: string | null
    enforceBinCapacity: boolean
    isActive: boolean
    notes?: string | null
    warehouse?: { code?: string; name?: string }
    storageType?: { code?: string; name?: string } | null
}

export type PickingRule = {
    id: string
    warehouseId: string
    code: string
    name: string
    strategyCode: string
    priority: number
    isActive: boolean
    notes?: string | null
    warehouse?: { code?: string; name?: string }
}

export const warehouseRulesService = {
    listPutaway: (warehouseId?: string) =>
        ErpAxiosBase.get<PutawayRule[]>(`${BASE}/putaway`, {
            params: warehouseId ? { warehouseId } : undefined,
        }).then((r) => r.data),

    createPutaway: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<PutawayRule>(`${BASE}/putaway`, data).then((r) => r.data),

    updatePutaway: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<PutawayRule>(`${BASE}/putaway/${id}`, data).then((r) => r.data),

    deletePutaway: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/putaway/${id}`).then((r) => r.data),

    listPicking: (warehouseId?: string) =>
        ErpAxiosBase.get<PickingRule[]>(`${BASE}/picking`, {
            params: warehouseId ? { warehouseId } : undefined,
        }).then((r) => r.data),

    createPicking: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<PickingRule>(`${BASE}/picking`, data).then((r) => r.data),

    updatePicking: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<PickingRule>(`${BASE}/picking/${id}`, data).then((r) => r.data),

    deletePicking: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/picking/${id}`).then((r) => r.data),
}
