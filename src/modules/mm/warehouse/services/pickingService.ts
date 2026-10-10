import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    PickingTask,
    PickingTaskListResponse,
    PickingQueryParams,
    CreatePickingTaskPayload,
} from '../types'

const BASE = '/mm/picking'

export const pickingService = {
    list: (params?: PickingQueryParams) =>
        ErpAxiosBase.get<PickingTaskListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<PickingTask>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreatePickingTaskPayload) =>
        ErpAxiosBase.post<PickingTask>(BASE, data).then((r) => r.data),

    assign: (id: string, data: { assignedUser: string }) =>
        ErpAxiosBase.post<PickingTask>(`${BASE}/${id}/assign`, data).then(
            (r) => r.data,
        ),

    confirmPick: (id: string, data: {
        scannedBinId: string
        scannedMaterialId: string
        scannedBatchId?: string
        scannedSerialId?: string
        pickedQty: number
        idempotencyKey?: string
    }) =>
        ErpAxiosBase.post<PickingTask>(`${BASE}/${id}/confirm`, data).then(
            (r) => r.data,
        ),

    fromReservation: (reservationId: string, data?: { strategy?: string }) =>
        ErpAxiosBase.post<PickingTask>(`${BASE}/from-reservation/${reservationId}`, data ?? {}).then(
            (r) => r.data,
        ),

    cancel: (id: string) =>
        ErpAxiosBase.post<PickingTask>(`${BASE}/${id}/cancel`).then(
            (r) => r.data,
        ),
}
