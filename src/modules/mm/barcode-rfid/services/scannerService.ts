import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { ResolveHit, ScannerEventPayload, ScannerEventResult } from '../types'

const SCANNER = '/mm/scanner'
const MOBILE = '/mm/mobile'

export const scannerService = {
    /** Canonical Phase 11 resolve */
    resolve: (barcode: string, companyId?: string, extras?: Record<string, unknown>) =>
        ErpAxiosBase.post<ResolveHit>(`${SCANNER}/resolve`, {
            barcode,
            companyId,
            ...extras,
        }).then((r) => r.data),

    /** Legacy GET resolve (still supported) */
    resolveGet: (barcode: string, companyId?: string) =>
        ErpAxiosBase.get<ResolveHit>(`${SCANNER}/resolve`, {
            params: { barcode, companyId },
        }).then((r) => r.data),

    postEvent: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(`${SCANNER}/events`, payload).then(
            (r) => r.data,
        ),

    postEventBatch: (events: ScannerEventPayload[]) =>
        ErpAxiosBase.post<{
            results: ScannerEventResult[]
            processed: number
        }>(`${SCANNER}/events/batch`, { events }).then((r) => r.data),

    listEvents: (params?: any) =>
        ErpAxiosBase.get<{ data: ScannerEventResult[]; total: number }>(
            `${SCANNER}/events`,
            { params },
        ).then((r) => r.data),

    // ── Mobile execution channel aliases ─────────────────────────

    registerDevice: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${MOBILE}/devices/register`, data).then((r) => r.data),

    receivingScan: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(
            `${MOBILE}/receiving/scan`,
            payload,
        ).then((r) => r.data),

    putawayScan: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(
            `${MOBILE}/putaway/scan`,
            payload,
        ).then((r) => r.data),

    pickingScan: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(
            `${MOBILE}/picking/scan`,
            payload,
        ).then((r) => r.data),

    countingScan: (payload: ScannerEventPayload) =>
        ErpAxiosBase.post<ScannerEventResult>(
            `${MOBILE}/counting/scan`,
            payload,
        ).then((r) => r.data),

    sync: (payload: {
        deviceId: string
        companyId?: string
        userId?: string
        sessionToken?: string
        events: ScannerEventPayload[]
    }) =>
        ErpAxiosBase.post<{ processed: number; results: any[] }>(
            `${MOBILE}/sync`,
            payload,
        ).then((r) => r.data),
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
