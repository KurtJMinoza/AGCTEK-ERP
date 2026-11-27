import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SalesOrderAccountingSnapshot } from './salesOrderFinanceService'

export type ReturnRequestAccountingSnapshot = {
    returnRequestId: string
    requestNumber: string
    companyId: string
    salesOrderId: string
    mmCustomerReturnId: string | null
    journals: SalesOrderAccountingSnapshot['journals']
    accountingEvents: SalesOrderAccountingSnapshot['accountingEvents']
}

export async function fetchReturnRequestAccounting(
    returnRequestId: string,
    companyId?: string,
): Promise<ReturnRequestAccountingSnapshot> {
    const { data } = await ErpAxiosBase.get<ReturnRequestAccountingSnapshot>(
        `/sd/returns/${encodeURIComponent(returnRequestId)}/accounting`,
        { params: companyId ? { companyId } : undefined },
    )
    return data
}
