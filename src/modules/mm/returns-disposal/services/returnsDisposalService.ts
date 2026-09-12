import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    SupplierReturn,
    Disposal,
    ReturnsDisposalConfig,
    BlockedBalance,
    CustomerReturn,
} from '../types'

const BASE = '/mm/returns-disposal'

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number }

export const returnsDisposalService = {
    getConfig: (companyId: string) =>
        ErpAxiosBase.get<ReturnsDisposalConfig>(`${BASE}/config`, {
            params: { companyId },
        }).then((r) => r.data),

    upsertConfig: (data: any) =>
        ErpAxiosBase.patch<ReturnsDisposalConfig>(`${BASE}/config`, data).then(
            (r) => r.data,
        ),

    listReturns: (params?: any) =>
        ErpAxiosBase.get<Paginated<SupplierReturn>>(`${BASE}/supplier-returns`, {
            params,
        }).then((r) => r.data),

    getReturn: (id: string) =>
        ErpAxiosBase.get<SupplierReturn>(`${BASE}/supplier-returns/${id}`).then(
            (r) => r.data,
        ),

    createReturn: (data: any) =>
        ErpAxiosBase.post<SupplierReturn>(`${BASE}/supplier-returns`, data).then(
            (r) => r.data,
        ),

    createReturnFromBalances: (data: any) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/from-balances`,
            data,
        ).then((r) => r.data),

    updateReturn: (id: string, data: any) =>
        ErpAxiosBase.patch<SupplierReturn>(
            `${BASE}/supplier-returns/${id}`,
            data,
        ).then((r) => r.data),

    submitReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/submit`,
            { performedBy },
        ).then((r) => r.data),

    approveReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/approve`,
            { performedBy },
        ).then((r) => r.data),

    rejectReturn: (id: string, performedBy?: string, reason?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/reject`,
            { performedBy, reason },
        ).then((r) => r.data),

    shipReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/ship`,
            { performedBy },
        ).then((r) => r.data),

    /** Canonical post alias (also available at /mm/returns/supplier/:id/post). */
    postReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(`/mm/returns/supplier/${id}/post`, {
            performedBy,
        }).then((r) => r.data),

    cancelReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/cancel`,
            { performedBy },
        ).then((r) => r.data),

    reverseReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<SupplierReturn>(
            `${BASE}/supplier-returns/${id}/reverse`,
            { performedBy },
        ).then((r) => r.data),

    listCustomerReturns: (params?: any) =>
        ErpAxiosBase.get<Paginated<CustomerReturn>>(`${BASE}/customer-returns`, {
            params,
        }).then((r) => r.data),

    getCustomerReturn: (id: string) =>
        ErpAxiosBase.get<CustomerReturn>(`${BASE}/customer-returns/${id}`).then(
            (r) => r.data,
        ),

    createCustomerReturn: (data: any) =>
        ErpAxiosBase.post<CustomerReturn>(`/mm/returns/customer`, data).then(
            (r) => r.data,
        ),

    updateCustomerReturn: (id: string, data: any) =>
        ErpAxiosBase.patch<CustomerReturn>(
            `${BASE}/customer-returns/${id}`,
            data,
        ).then((r) => r.data),

    startIntake: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/intake`,
            { performedBy },
        ).then((r) => r.data),

    startInspection: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/inspection`,
            { performedBy },
        ).then((r) => r.data),

    inspectCustomerReturn: (
        id: string,
        data?: {
            performedBy?: string
            result?: string
            lotNotes?: string
            decisionNotes?: string
        },
    ) =>
        ErpAxiosBase.post<CustomerReturn>(`/mm/returns/customer/${id}/inspect`, data ?? {}).then(
            (r) => r.data,
        ),

    setDisposition: (
        lineId: string,
        disposition: string,
        performedBy?: string,
    ) =>
        ErpAxiosBase.post(
            `${BASE}/customer-returns/lines/${lineId}/disposition`,
            { disposition, performedBy },
        ).then((r) => r.data),

    dispositionCustomerReturn: (
        id: string,
        lines: Array<{ lineId: string; disposition: string }>,
        performedBy?: string,
    ) =>
        ErpAxiosBase.post(`/mm/returns/customer/${id}/disposition`, {
            lines,
            performedBy,
        }).then((r) => r.data),

    submitCustomerReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/submit`,
            { performedBy },
        ).then((r) => r.data),

    approveCustomerReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/approve`,
            { performedBy },
        ).then((r) => r.data),

    rejectCustomerReturn: (
        id: string,
        performedBy?: string,
        reason?: string,
    ) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/reject`,
            { performedBy, reason },
        ).then((r) => r.data),

    completeCustomerReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/complete`,
            { performedBy },
        ).then((r) => r.data),

    cancelCustomerReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/cancel`,
            { performedBy },
        ).then((r) => r.data),

    reverseCustomerReturn: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<CustomerReturn>(
            `${BASE}/customer-returns/${id}/reverse`,
            { performedBy },
        ).then((r) => r.data),

    listDisposals: (params?: any) =>
        ErpAxiosBase.get<Paginated<Disposal>>(`/mm/disposals`, {
            params,
        }).then((r) => r.data),

    getDisposal: (id: string) =>
        ErpAxiosBase.get<Disposal>(`/mm/disposals/${id}`).then((r) => r.data),

    createDisposal: (data: any) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals`, data).then((r) => r.data),

    createDisposalFromBalances: (data: any) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/from-balances`, data).then(
            (r) => r.data,
        ),

    updateDisposal: (id: string, data: any) =>
        ErpAxiosBase.patch<Disposal>(`/mm/disposals/${id}`, data).then(
            (r) => r.data,
        ),

    submitDisposal: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/submit`, {
            performedBy,
        }).then((r) => r.data),

    approveDisposal: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/approve`, {
            performedBy,
        }).then((r) => r.data),

    rejectDisposal: (id: string, performedBy?: string, reason?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/reject`, {
            performedBy,
            reason,
        }).then((r) => r.data),

    postDisposal: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/post`, {
            performedBy,
        }).then((r) => r.data),

    cancelDisposal: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/cancel`, {
            performedBy,
        }).then((r) => r.data),

    reverseDisposal: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<Disposal>(`/mm/disposals/${id}/reverse`, {
            performedBy,
        }).then((r) => r.data),

    blockExpiredStock: (companyId: string, performedBy?: string) =>
        ErpAxiosBase.post(`/mm/returns/expiry/block-expired`, {
            companyId,
            performedBy,
        }).then((r) => r.data),

    getDamagedStock: (params?: any) =>
        ErpAxiosBase.get<Paginated<BlockedBalance>>(`${BASE}/damaged-stock`, {
            params,
        }).then((r) => r.data),

    getExpiredStock: (params?: any) =>
        ErpAxiosBase.get<Paginated<BlockedBalance>>(`${BASE}/expired-stock`, {
            params,
        }).then((r) => r.data),

    identifyDamage: (data: any) =>
        ErpAxiosBase.post(`${BASE}/damaged-stock/identify`, data).then(
            (r) => r.data,
        ),

    markExpired: (data: any) =>
        ErpAxiosBase.post(`${BASE}/expired-stock/mark`, data).then((r) => r.data),
}
