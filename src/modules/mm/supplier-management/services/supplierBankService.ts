import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SupplierBankAccount } from '../types'

const base = (supplierId: string) => `/mm/suppliers/${supplierId}/bank-accounts`

export const supplierBankService = {
    list: (supplierId: string) =>
        ErpAxiosBase.get<SupplierBankAccount[]>(base(supplierId)).then((r) => r.data),

    reveal: (supplierId: string, id: string, performedBy: string) =>
        ErpAxiosBase.get<SupplierBankAccount>(`${base(supplierId)}/${id}/reveal`, {
            params: { performedBy },
        }).then((r) => r.data),

    create: (supplierId: string, data: any) =>
        ErpAxiosBase.post<SupplierBankAccount>(base(supplierId), data).then((r) => r.data),

    update: (supplierId: string, id: string, data: any) =>
        ErpAxiosBase.put<SupplierBankAccount>(`${base(supplierId)}/${id}`, data).then((r) => r.data),

    delete: (supplierId: string, id: string) =>
        ErpAxiosBase.delete(`${base(supplierId)}/${id}`).then((r) => r.data),
}
