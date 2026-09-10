import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    PutawayTask,
    PutawayTaskListResponse,
    PutawayQueryParams,
    CreatePutawayPayload,
} from '../types'

const BASE = '/mm/putaway'

export const putawayService = {
    list: (params?: PutawayQueryParams) =>
        ErpAxiosBase.get<PutawayTaskListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<PutawayTask>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreatePutawayPayload) =>
        ErpAxiosBase.post<PutawayTask>(BASE, data).then((r) => r.data),

    assign: (id: string, data: { workerId?: string; assignedWorker?: string }) =>
        ErpAxiosBase.post<PutawayTask>(`${BASE}/${id}/assign`, {
            workerId: data.workerId ?? data.assignedWorker,
            assignedWorker: data.assignedWorker ?? data.workerId,
        }).then((r) => r.data),

    confirm: (id: string, data: { actualBinId: string; quantity: number; scannedBinCode?: string }) =>
        ErpAxiosBase.post<PutawayTask>(`${BASE}/${id}/confirm`, data).then(
            (r) => r.data,
        ),

    cancel: (id: string) =>
        ErpAxiosBase.post<PutawayTask>(`${BASE}/${id}/cancel`).then(
            (r) => r.data,
        ),
}
