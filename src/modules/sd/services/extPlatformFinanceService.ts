import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SalesOrderAccountingSnapshot } from './salesOrderFinanceService'

export type ExtPlatformReceivableSnapshot = {
    arDocumentId: string | null
    openAmount: string | null
    originalAmount: string | null
    openItemStatus: string | null
    customerId: string | null
    customerName: string | null
    dueDate: string | null
}

export type ExtPlatformAccountingSnapshot = {
    transactionId: string
    transactionNumber: string
    companyId: string
    status: string
    settlementStatus: string
    platformFees: string
    actualPlatformFees: string | null
    actualPayout: string | null
    settledAt: string | null
    settlementJournalEntryId: string | null
    recordedByUserId: string | null
    recordedByName: string | null
    recordedByEmployeeCode: string | null
    approvedByUserId: string | null
    approvedByName: string | null
    approvedByEmployeeCode: string | null
    receivable: ExtPlatformReceivableSnapshot | null
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