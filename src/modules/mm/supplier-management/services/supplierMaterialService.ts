import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    SupplierMaterial,
    SupplierMaterialListResponse,
} from '../types'

const BASE = '/mm/supplier-materials'

export const supplierMaterialService = {
    list: (params?: { supplierId?: string; materialId?: string; page?: number; pageSize?: number }) =>
        ErpAxiosBase.get<SupplierMaterialListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<SupplierMaterial>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<SupplierMaterial>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<SupplierMaterial>(`${BASE}/${id}`, data).then((r) => r.data),

    deactivate: (id: string) =>
        ErpAxiosBase.post<SupplierMaterial>(`${BASE}/${id}/deactivate`, {}).then((r) => r.data),

    delete: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
