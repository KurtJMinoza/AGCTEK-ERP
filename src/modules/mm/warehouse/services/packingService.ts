import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WmPackage,
    PackageListResponse,
    PackageQueryParams,
    CreatePackagePayload,
    PackingSession,
} from '../types'

const BASE = '/mm/packages'
const SESSION_BASE = '/mm/packing-sessions'

export const packingService = {
    list: (params?: PackageQueryParams) =>
        ErpAxiosBase.get<PackageListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<WmPackage>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreatePackagePayload) =>
        ErpAxiosBase.post<WmPackage>(BASE, data).then((r) => r.data),

    scanItem: (
        id: string,
        data: { materialId: string; batchId?: string; serialId?: string },
    ) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/scan`, data).then(
            (r) => r.data,
        ),

    verify: (id: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/verify`).then(
            (r) => r.data,
        ),

    seal: (id: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/seal`).then(
            (r) => r.data,
        ),

    readyForDispatch: (id: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/ready-for-dispatch`).then(
            (r) => r.data,
        ),

    dispatch: (id: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/dispatch`).then(
            (r) => r.data,
        ),

    fromPicking: (pickingTaskId: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/from-picking/${pickingTaskId}`).then(
            (r) => r.data,
        ),

    listSessions: (params?: { warehouseId?: string; status?: string }) =>
        ErpAxiosBase.get<PackingSession[]>(SESSION_BASE, { params }).then((r) => r.data),

    getSession: (id: string) =>
        ErpAxiosBase.get<PackingSession>(`${SESSION_BASE}/${id}`).then((r) => r.data),

    openSession: (data: { warehouseId: string; pickingTaskId?: string; warehouseTaskId?: string }) =>
        ErpAxiosBase.post<PackingSession>(SESSION_BASE, data).then((r) => r.data),

    openSessionFromPicking: (pickingTaskId: string) =>
        ErpAxiosBase.post<PackingSession>(`${SESSION_BASE}/from-picking/${pickingTaskId}`).then(
            (r) => r.data,
        ),

    completeSession: (id: string) =>
        ErpAxiosBase.post<PackingSession>(`${SESSION_BASE}/${id}/complete`).then((r) => r.data),
}
