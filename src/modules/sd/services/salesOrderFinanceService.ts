import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type SalesOrderJournalLineSummary = {
    lineNumber: number
    glAccountId: string
    accountCode: string
    accountName: string
    debitAmount: string
    creditAmount: string
    description: string | null
}

export type SalesOrderJournalSummary = {
    id: string
    documentNumber: string | null
    documentType: string
    status: string
    postingDate: string
    currencyCode: string
    totalAmount: string
    description: string | null
    sourceModule: string | null
    primaryGlAccountId: string | null
    primaryAccountCode: string | null
    lineCount: number
    idempotencyKey?: string | null
    lines?: SalesOrderJournalLineSummary[]
}

export type SalesOrderAccountingSnapshot = {
    salesOrderId: string
    orderNumber: string
    companyId: string
    channel: string
    cashierUserId: string | null
    cashierName: string | null
    cashierEmployeeCode: string | null
    performedByUserId: string | null
    performedByName: string | null
    performedByEmployeeCode: string | null
    journals: SalesOrderJournalSummary[]
    accountingEvents: Array<{
        id: string
        eventType: string
        status: string
        journalEntryId: string | null
        lastError: string | null
        idempotencyKey: string
    }>
}

export async function fetchSalesOrderAccounting(
    salesOrderId: string,
    companyId?: string | null,
): Promise<SalesOrderAccountingSnapshot> {
    const { data } = await ErpAxiosBase.get<SalesOrderAccountingSnapshot>(
        `/sd/sales-orders/${salesOrderId}/accounting`,
        { params: companyId ? { companyId } : undefined },
    )
    return data
}