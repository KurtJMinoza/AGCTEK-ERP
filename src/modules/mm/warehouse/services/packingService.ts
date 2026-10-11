import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WmPackage,
    PackageListResponse,
    PackageQueryParams,
    CreatePackagePayload,
    PackingSession,
    PackageScanLogEntry,
    PackingScanResult,
    AdjustPackageItemPayload,
    CompletePackingPayload,
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

    /**
     * Scanner-first scan: send `barcode` or `materialCode` (or `materialId`)
     * with the quantity. The server resolves the material, blocks wrong items
     * and over-scanning, and returns full package progress.
     */
    scanItem: (
        id: string,
        data: {
            materialId?: string
            materialCode?: string
            barcode?: string
            quantity?: number
            batchId?: string
            serialId?: string
            scanType?: 'barcode' | 'manual'
            idempotencyKey?: string
        },
    ) =>
        ErpAxiosBase.post<PackingScanResult>(`${BASE}/${id}/scan`, data).then(
            (r) => r.data,
        ),

    /** Manual +1 / −1 / add quantity / reset when no barcode scanner is used. */
    adjustItem: (id: string, itemId: string, data: AdjustPackageItemPayload) =>
        ErpAxiosBase.post<PackingScanResult>(
            `${BASE}/${id}/items/${itemId}/adjust`,
            data,
        ).then((r) => r.data),

    /** Complete Packing — server blocks it until every quantity is scanned. */
    completePacking: (id: string, data?: CompletePackingPayload) =>
        ErpAxiosBase.post<PackingScanResult>(
            `${BASE}/${id}/complete`,
            data ?? {},
        ).then((r) => r.data),

    /** "Recently scanned" feed. */
    scanLogs: (id: string) =>
        ErpAxiosBase.get<PackageScanLogEntry[]>(`${BASE}/${id}/scan-logs`).then(
            (r) => r.data,
        ),

    /** Resolve a QR/barcode to a material (+batch/serial) before packing. */
    resolveCode: (barcode: string) =>
        ErpAxiosBase.get<{
            type: string
            barcode: string
            materialId?: string
            material?: {
                id: string
                materialCode: string
                materialName: string
            }
            batchId?: string
            batch?: { id: string; batchNumber: string; materialId: string }
            serialNumberId?: string
            serial?: { id: string; serialNumber: string; materialId: string }
        }>('/mm/scanner/resolve', { params: { barcode } }).then(
            (r) => r.data,
        ),

    verify: (id: string) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/verify`).then(
            (r) => r.data,
        ),

    seal: (
        id: string,
        data?: { weight?: number; length?: number; width?: number; height?: number },
    ) =>
        ErpAxiosBase.post<WmPackage>(`${BASE}/${id}/seal`, data ?? {}).then(
            (r) => r.data,
        ),

    readyForDispatch: (
        id: string,
        data?: {
            shipToName?: string
            shipToAddress?: string
            shipToLat?: number
            shipToLng?: number
        },
    ) =>
        ErpAxiosBase.post<WmPackage>(
            `${BASE}/${id}/ready-for-dispatch`,
            data ?? {},
        ).then((r) => r.data),

    retryScmRelease: (id: string) =>
        ErpAxiosBase.post<WmPackage>(
            `${BASE}/${id}/retry-scm-release`,
        ).then((r) => r.data),

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
