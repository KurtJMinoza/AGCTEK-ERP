import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { ResolveHit, ScannerEventPayload, ScannerEventResult } from '../types'

const BASE = '/mm/scanner'

export const scannerService = {
    resolve: (barcode: string, companyId?: string) =>
        ErpAxiosBase.get<ResolveHit>(`${BASE}/resolve`, {
            params: { barcode, companyId },
        }).then((r) => r.data),

    postEvent: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(`${BASE}/events`, payload).then(
            (r) => r.data,
        ),

    postEventBatch: (events: ScannerEventPayload[]) =>
        ErpAxiosBase.post<{
            results: ScannerEventResult[]
            processed: number
        }>(`${BASE}/events/batch`, { events }).then((r) => r.data),

    listEvents: (params?: any) =>
        ErpAxiosBase.get<{ data: ScannerEventResult[]; total: number }>(`${BASE}/events`, {
            params,
        }).then((r) => r.data),
}

export function newIdempotencyKey(prefix = 'scan') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getScannerUserId() {
    if (typeof window === 'undefined') return 'scanner-user'
    try {
        const raw = localStorage.getItem('user') || localStorage.getItem('authUser')
        if (raw) {
            const u = JSON.parse(raw)
            if (u?.id) return u.id
        }
    } catch {
        /* ignore */
    }
    return 'scanner-user'
}

export function getDeviceId() {
    if (typeof window === 'undefined') return 'web-device'
    let id = localStorage.getItem('mm_scanner_device_id')
    if (!id) {
        id = `web-${Math.random().toString(36).slice(2, 12)}`
        localStorage.setItem('mm_scanner_device_id', id)
    }
    return id
}
