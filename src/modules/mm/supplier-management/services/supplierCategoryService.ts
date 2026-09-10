import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SupplierCategory } from '../types'

const BASE = '/mm/supplier-categories'

export const supplierCategoryService = {
    list: () =>
        ErpAxiosBase.get<SupplierCategory[]>(BASE).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<SupplierCategory>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<SupplierCategory>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<SupplierCategory>(`${BASE}/${id}`, data).then((r) => r.data),

    delete: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
