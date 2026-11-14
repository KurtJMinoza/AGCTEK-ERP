import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'
import type {
    SalesSource,
    ExtPlatformTransaction,
    ExtPlatformTransactionListResult,
    ExtPlatformReportSummary,
    CreateExtPlatformTransactionInput,
    ExtPlatformTaxPreview,
    ExtPlatformStock,
    UpdateExtPlatformTransactionInput,
} from '../types/extPlatform'

export type {
    SalesSource,
    ExtPlatformTransaction,
    ExtPlatformTransactionListResult,
    ExtPlatformReportSummary,
    CreateExtPlatformTransactionInput,
}

const BASE = '/sd/ext-platform'

// ── Sales Sources ──

export async function fetchSalesSources(): Promise<SalesSource[]> {
    try {
        const { data } = await ErpAxiosBase.get<SalesSource[]>(
            `${BASE}/sources`,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load sales sources')
    }
}

export async function createSalesSource(
    input: Pick<SalesSource, 'code' | 'name'> & {
        description?: string
        badgeColor?: string
    },
): Promise<SalesSource> {
    try {
        const { data } = await ErpAxiosBase.post<SalesSource>(
            `${BASE}/sources`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to create sales source')
    }
}

export async function updateSalesSource(
    id: string,
    input: Partial<Pick<SalesSource, 'name' | 'description' | 'badgeColor' | 'isActive' | 'sortOrder'>>,
): Promise<SalesSource> {
    try {
        const { data } = await ErpAxiosBase.patch<SalesSource>(
            `${BASE}/sources/${id}`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to update sales source')
    }
}

export async function deleteSalesSource(id: string): Promise<void> {
    try {
        await ErpAxiosBase.delete(`${BASE}/sources/${id}`)
    } catch (error) {
        throw toApiError(error, 'Unable to delete sales source')
    }
}

// ── Transactions ──

export async function fetchExtPlatformTransactions(params: {
    companyId?: string
    salesSourceId?: string
    branchId?: string
    status?: string
    search?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
}): Promise<ExtPlatformTransactionListResult> {
    try {
        const { data } =
            await ErpAxiosBase.get<ExtPlatformTransactionListResult>(
                `${BASE}/transactions`,
                { params },
            )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load transactions')
    }
}

export async function fetchExtPlatformTransaction(
    id: string,
): Promise<ExtPlatformTransaction> {
    try {
        const { data } = await ErpAxiosBase.get<ExtPlatformTransaction>(
            `${BASE}/transactions/${id}`,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load transaction')
    }
}

export async function createExtPlatformTransaction(
    input: CreateExtPlatformTransactionInput,
): Promise<ExtPlatformTransaction> {
    try {
        const { data } = await ErpAxiosBase.post<ExtPlatformTransaction>(
            `${BASE}/transactions`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to create transaction')
    }
}

/** Live MM availability for catalog items (max 2000 per call). */
export async function fetchExtPlatformStock(
    items: Array<{ productId: string; variantId?: string }>,
): Promise<ExtPlatformStock[]> {
    try {
        const { data } = await ErpAxiosBase.post<ExtPlatformStock[]>(
            `${BASE}/stock`,
            { items },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load stock')
    }
}

/** SD tax determination dry-run; nothing is saved. */
export async function previewExtPlatformTransaction(input: {
    companyId: string
    transactionDate: string
    isCompanyInventory?: boolean
    platformFees?: number
    lines: CreateExtPlatformTransactionInput['lines']
}): Promise<ExtPlatformTaxPreview> {
    try {
        const { data } = await ErpAxiosBase.post<ExtPlatformTaxPreview>(
            `${BASE}/transactions/preview`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to calculate tax')
    }
}

export async function updateExtPlatformTransaction(
    id: string,
    input: UpdateExtPlatformTransactionInput,
): Promise<ExtPlatformTransaction> {
    try {
        const { data } = await ErpAxiosBase.patch<ExtPlatformTransaction>(
            `${BASE}/transactions/${id}`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to update transaction')
    }
}

export async function updateExtPlatformTransactionStatus(
    id: string,
    status: 'CONFIRMED' | 'APPROVED' | 'CANCELLED',
): Promise<ExtPlatformTransaction> {
    try {
        const { data } = await ErpAxiosBase.patch<ExtPlatformTransaction>(
            `${BASE}/transactions/${id}/status`,
            { status },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to update transaction status')
    }
}

export async function deleteExtPlatformTransaction(
    id: string,
): Promise<void> {
    try {
        await ErpAxiosBase.delete(`${BASE}/transactions/${id}`)
    } catch (error) {
        throw toApiError(error, 'Unable to delete transaction')
    }
}

export async function fetchExtPlatformReportSummary(params: {
    companyId?: string
    salesSourceId?: string
    from?: string
    to?: string
}): Promise<ExtPlatformReportSummary> {
    try {
        const { data } = await ErpAxiosBase.get<ExtPlatformReportSummary>(
            `${BASE}/transactions/report-summary`,
            { params },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load report summary')
    }
}
