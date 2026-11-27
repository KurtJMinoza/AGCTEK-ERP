import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/supporting-ops'

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number }

export const supportingOpsService = {
    listBarcodes: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<Paginated<any>>(`${BASE}/barcode-registry`, { params }).then(
            (r) => r.data,
        ),
    createBarcode: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/barcode-registry`, data).then((r) => r.data),
    archiveBarcode: (id: string, performedBy?: string) =>
        ErpAxiosBase.post(`${BASE}/barcode-registry/${id}/archive`, { performedBy }).then(
            (r) => r.data,
        ),

    listRfid: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<Paginated<any>>(`${BASE}/rfid-tags`, { params }).then((r) => r.data),
    assignRfid: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/rfid-tags/assign`, data).then((r) => r.data),
    recordRfidRead: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/rfid-tags/read`, data).then((r) => r.data),
    archiveRfid: (id: string, body: { companyId: string; performedBy?: string }) =>
        ErpAxiosBase.post(`${BASE}/rfid-tags/${id}/archive`, body).then((r) => r.data),

    listDevices: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<any[]>(`${BASE}/warehouse-devices`, { params }).then((r) => r.data),
    registerDevice: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/warehouse-devices`, data).then((r) => r.data),
    revokeDevice: (deviceCode: string, revokedBy?: string) =>
        ErpAxiosBase.post(`${BASE}/warehouse-devices/revoke`, { deviceCode, revokedBy }).then(
            (r) => r.data,
        ),
}
