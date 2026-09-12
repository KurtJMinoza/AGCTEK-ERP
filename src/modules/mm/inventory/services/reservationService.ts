import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type Reservation = {
    id: string
    reservationNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code?: string; name?: string }
    materialId: string
    material?: { id: string; materialCode?: string; materialName?: string }
    quantity: number | string
    reservedQuantity: number | string
    fulfilledQuantity: number | string
    sourceType: string
    sourceModule: string
    sourceDocumentType: string
    sourceDocumentId: string
    status: string
    validUntil?: string | null
    createdAt: string
}

export type AtpResult = {
    companyId: string
    warehouseId: string
    materialId: string
    onHand?: number
    unrestrictedOnHand?: number
    reserved?: number
    restricted?: number
    unrestrictedStock: number
    existingReservations: number
    restrictedStock: number
    available: number
    balances: Array<{
        id: string
        stockStatus: string
        quantity: number
        reservedQuantity: number
        availableQuantity: number
        storageBinId?: string | null
    }>
}

const RSV = '/mm/reservations'
const ENGINE = '/mm/inventory'

export type ReservationHeader = {
    id: string
    reservationNumber: string
    companyId: string
    warehouseId: string
    status: string
    demandReferenceType?: string
    demandReferenceId?: string
    lines?: Array<{
        id: string
        materialId: string
        requestedQuantity: number
        reservedQuantity: number
        allocatedQuantity: number
        status: string
    }>
}

export const reservationService = {
    list: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: Reservation[]; meta: any }>(RSV, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<Reservation>(`${RSV}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<Reservation>(RSV, data).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<Reservation>(`${RSV}/${id}/cancel`).then((r) => r.data),

    /** Phase 5 reservation engine (header + lines). */
    listEngine: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ReservationHeader[]; total: number }>(`${ENGINE}/reservations`, {
            params,
        }).then((r) => r.data),

    createEngine: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<ReservationHeader>(`${ENGINE}/reservations`, data).then((r) => r.data),

    releaseEngine: (id: string) =>
        ErpAxiosBase.post<ReservationHeader>(`${ENGINE}/reservations/${id}/release`).then(
            (r) => r.data,
        ),

    allocate: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(`${ENGINE}/reservations/${id}/allocate`, data ?? {}).then((r) => r.data),

    listAllocations: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get(`${ENGINE}/allocations`, { params }).then((r) => r.data),

    releaseAllocation: (id: string) =>
        ErpAxiosBase.post(`${ENGINE}/allocations/${id}/release`).then((r) => r.data),

    /** Delegates to central MM-08 availability engine. */
    atp: (params: Record<string, string>) =>
        ErpAxiosBase.get<AtpResult>(`${ENGINE}/availability`, { params }).then((r) => {
            const d = r.data
            return {
                ...d,
                unrestrictedStock: d.unrestrictedOnHand ?? d.unrestrictedStock ?? 0,
                existingReservations: d.reserved ?? d.existingReservations ?? 0,
                restrictedStock: d.restricted ?? d.restrictedStock ?? 0,
            }
        }),
}
