import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    PickWave,
    PickWaveListResponse,
    PickingQueryParams,
    CreatePickWavePayload,
} from '../types'

const BASE = '/mm/pick-waves'

export const pickWaveService = {
    list: (params?: PickingQueryParams) =>
        ErpAxiosBase.get<PickWaveListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<PickWave>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreatePickWavePayload) =>
        ErpAxiosBase.post<PickWave>(BASE, data).then((r) => r.data),

    start: (id: string) =>
        ErpAxiosBase.post<PickWave>(`${BASE}/${id}/start`).then(
            (r) => r.data,
        ),

    complete: (id: string) =>
        ErpAxiosBase.post<PickWave>(`${BASE}/${id}/complete`).then(
            (r) => r.data,
        ),

    cancel: (id: string) =>
        ErpAxiosBase.post<PickWave>(`${BASE}/${id}/cancel`).then(
            (r) => r.data,
        ),
}
