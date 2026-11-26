import type { ApOpenItemRow } from '../../types/accountsPayable'

export const apAmount = (value: number | string | null | undefined) => {
    const n = typeof value === 'number' ? value : Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
}

/** Supplier liability (invoice) open items — eligible for outgoing payment. */
export const isPayableOpenItem = (item: ApOpenItemRow) =>
    item.direction === 'CREDIT' &&
    (item.status === 'OPEN' || item.status === 'PARTIALLY_CLEARED') &&
    !item.paymentBlocked &&
    apAmount(item.openAmount) > 0

/** Supplier credit / advance — debit side for clearing. */
export const isCreditOpenItem = (item: ApOpenItemRow) =>
    item.direction === 'DEBIT' &&
    (item.status === 'OPEN' || item.status === 'PARTIALLY_CLEARED') &&
    apAmount(item.openAmount) > 0