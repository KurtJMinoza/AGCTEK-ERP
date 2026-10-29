'use client'

import type { RcvBadgeTone as RdBadgeTone } from '@/modules/mm/receiving/components/receivingTableUi'
import {
    SmEntityCell,
    SmUnitPriceCell,
} from '@/modules/mm/supplier-management/components/SupplierTableCells'

export type { RdBadgeTone }

export {
    fmtRcvDate as fmtRdDate,
    RcvAnimatedStatus as RdAnimatedStatus,
    RcvDateCell as RdDateCell,
    RcvDocNumberCell as RdDocNumberCell,
    RcvPartyCell as RdPartyCell,
    RcvPlainCell as RdPlainCell,
    RcvQtyCell as RdQtyCell,
    RCV_SUPPLIER_RETURN_STATUS as RD_SUPPLIER_RETURN_STATUS,
    rcvStatusTone as rdStatusTone,
} from '@/modules/mm/receiving/components/receivingTableUi'

export function rdTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function RdMaterialCell({
    code,
    name,
}: {
    code?: string | null
    name?: string | null
}) {
    const hasName = Boolean(name?.trim())
    return (
        <SmEntityCell
            kind="material"
            primary={hasName ? name : code}
            secondary={hasName ? code : null}
        />
    )
}

export const RD_CUSTOMER_RETURN_STATUS: Record<string, RdBadgeTone> = {
    DRAFT: 'default',
    INTAKE: 'info',
    INSPECTION: 'warning',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

export const RD_DISPOSAL_STATUS: Record<string, RdBadgeTone> = {
    DRAFT: 'default',
    SUBMITTED: 'warning',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    EXECUTED: 'info',
    REJECTED: 'danger',
    POSTED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

export function RdMoneyCell({ amount }: { amount?: number | string | null }) {
    const n = amount != null && amount !== '' ? Number(amount) : null
    if (n == null || !Number.isFinite(n)) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return <SmUnitPriceCell amount={n} currencyCode="Amount" />
}

export const RD_BLOCKED_STOCK_STATUS: Record<string, RdBadgeTone> = {
    BLOCKED: 'danger',
    DAMAGED: 'danger',
    EXPIRED: 'warning',
    QUARANTINE: 'warning',
}
