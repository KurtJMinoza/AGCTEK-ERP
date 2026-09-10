import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { PaymentTerms } from '../types'

const BASE = '/mm/payment-terms'

export const paymentTermsService = {
    list: () =>
        ErpAxiosBase.get<PaymentTerms[]>(BASE).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<PaymentTerms>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<PaymentTerms>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<PaymentTerms>(`${BASE}/${id}`, data).then((r) => r.data),

    delete: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
