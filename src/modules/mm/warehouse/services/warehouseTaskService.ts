import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WarehouseTask,
    WarehouseTaskListResponse,
    WarehouseTaskQueryParams,
} from '../types'

const BASE = '/mm/warehouse/tasks'

export const warehouseTaskService = {
    list: (params?: WarehouseTaskQueryParams) =>
        ErpAxiosBase.get<WarehouseTaskListResponse>(BASE, { params }).then((r) => r.data),

    myTasks: (params?: WarehouseTaskQueryParams) =>
        ErpAxiosBase.get<WarehouseTaskListResponse>(`${BASE}/my`, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<WarehouseTask>(`${BASE}/${id}`).then((r) => r.data),

    assign: (id: string, userId: string) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/assign`, { userId }).then((r) => r.data),

    start: (id: string) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/start`, {}).then((r) => r.data),

    complete: (
        id: string,
        data: {
            quantity: number
            destinationBinId?: string
            sourceBinId?: string
            scannedBinId?: string
            scannedMaterialId?: string
            scannedBatchId?: string
            scannedSerialId?: string
        },
    ) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/complete`, data).then((r) => r.data),

    cancel: (id: string, reason?: string) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/cancel`, { reason }).then((r) => r.data),

    reportException: (id: string, data: { exceptionCode: string; details?: string }) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/exception`, data).then((r) => r.data),

    releaseException: (id: string) =>
        ErpAxiosBase.post<WarehouseTask>(`${BASE}/${id}/exception/release`, {}).then((r) => r.data),
}
