import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SalesOrderAccountingSnapshot } from './salesOrderFinanceService'

export type ExtPlatformAccountingSnapshot = {
    transactionId: string
    transactionNumber: string
    companyId: string
    status: string
    recordedByUserId: string | null
    recordedByName: string | null
    recordedByEmployeeCode: string | null
    approvedByUserId: string | null
    approvedByName: string | null
    approvedByEmployeeCode: string | null
    journals: SalesOrderAccountingSnapshot['journals']
    accountingEvents: SalesOrderAccountingSnapshot['accountingEvents']
}

export async function fetchExtPlatformAccounting(
    transactionId: string,
    companyId?: string,
): Promise<ExtPlatformAccountingSnapshot> {
    const { data } = await ErpAxiosBase.get<ExtPlatformAccountingSnapshot>(
        `/sd/ext-platform/transactions/${transactionId}/accounting`,
        { params: companyId ? { companyId } : undefined },
    )
    return data
}