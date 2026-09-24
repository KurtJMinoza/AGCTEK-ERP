import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { MmExceptionCounts, MmExceptionItem, MmExceptionListResponse } from '../types'

const BASE = '/mm/exceptions'

export type ExceptionCenterQuery = {
    companyId: string
    plantId?: string
    warehouseId?: string
    severity?: string
    domain?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    includeStale?: boolean
    page?: number
    limit?: number
}

export const exceptionCenterService = {
    list: (params: ExceptionCenterQuery) =>
        ErpAxiosBase.get<MmExceptionListResponse>(BASE, { params }).then((r) => r.data),

    counts: (params: ExceptionCenterQuery) =>
        ErpAxiosBase.get<MmExceptionCounts>(`${BASE}/counts`, { params }).then((r) => r.data),

    getOne: (id: string, params: Pick<ExceptionCenterQuery, 'companyId'>) =>
        ErpAxiosBase.get<MmExceptionItem>(`${BASE}/${encodeURIComponent(id)}`, {
            params,
        }).then((r) => r.data),
}
