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
const ATP = '/mm/available-stock'

export const reservationService = {
    list: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: Reservation[]; meta: any }>(RSV, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<Reservation>(`${RSV}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<Reservation>(RSV, data).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<Reservation>(`${RSV}/${id}/cancel`).then((r) => r.data),

    atp: (params: Record<string, string>) =>
        ErpAxiosBase.get<AtpResult>(ATP, { params }).then((r) => r.data),
}
