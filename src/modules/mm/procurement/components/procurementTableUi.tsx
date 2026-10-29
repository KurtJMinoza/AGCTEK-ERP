'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineReceiptTax,
    HiOutlineScale,
    HiOutlineShoppingCart,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import { SmEntityCell, SmUnitPriceCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'

export { fmtRcvDate as fmtPrcDate }

export type PrcBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function prcTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function prcIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type DocIcon = 'pr' | 'po' | 'rfq' | 'quote' | 'contract' | 'invoice' | 'match'

const DOC_ICONS: Record<DocIcon, typeof HiOutlineDocumentText> = {
    pr: HiOutlineClipboardList,
    po: HiOutlineShoppingCart,
    rfq: HiOutlineDocumentText,
    quote: HiOutlineReceiptTax,
    contract: HiOutlineDocumentText,
    invoice: HiOutlineReceiptTax,
    match: HiOutlineScale,
}

export function PrcDocNumberCell({
    primary,
    secondary,
    icon = 'po',
    onClick,
}: {
    primary: string
    secondary?: string | null
    icon?: DocIcon
    onClick?: () => void
}) {
    const Icon = DOC_ICONS[icon]
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${prcIconPopClass(70)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-primary">
                    {primary}
                </span>
                {secondary ? (
                    <p className="truncate text-[11px] text-gray-500">{secondary}</p>
                ) : null}
            </div>
        </div>
    )
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="w-full max-w-[14rem] rounded-lg text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
                {inner}
            </button>
        )
    }
    return inner
}

export function PrcPlainCell({
    children,
    mono,
    muted,
}: {
    children?: ReactNode
    mono?: boolean
    muted?: boolean
}) {
    if (children == null || children === '') {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <span
            className={`block max-w-[14rem] truncate text-sm ${
                mono ? 'font-mono text-xs' : ''
            } ${muted ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}
        >
            {children}
        </span>
    )
}

export function PrcDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function PrcQtyCell({ value, label }: { value?: number | string | null; label?: string }) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'
    return (
        <div className="min-w-[3rem]">
            <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatted}
            </p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

export function PrcMoneyCell({ amount, currency }: { amount?: number | string | null; currency?: string | null }) {
    return <SmUnitPriceCell amount={amount ?? 0} currencyCode={currency ?? 'Amount'} />
}

export function PrcSupplierCell({
    code,
    name,
}: {
    code?: string | null
    name?: string | null
}) {
    return <SmEntityCell kind="supplier" primary={name} secondary={code} />
}

export const PRC_PO_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'info',
    SENT: 'info',
    PARTIALLY_RECEIVED: 'warning',
    RECEIVED: 'success',
    FULLY_RECEIVED: 'success',
    CLOSED: 'success',
    CANCELLED: 'danger',
    REJECTED: 'danger',
}

export const PRC_PR_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    RETURNED: 'warning',
    PARTIALLY_CONVERTED: 'info',
    FULLY_CONVERTED: 'success',
    CONVERTED: 'success',
    CANCELLED: 'danger',
    CLOSED: 'default',
}

export const PRC_RFQ_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    OPEN: 'info',
    ISSUED: 'info',
    PARTIALLY_RESPONDED: 'warning',
    RESPONDED: 'info',
    EVALUATION: 'warning',
    AWARDED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
}

export const PRC_QUOTE_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    WITHDRAWN: 'default',
    EXPIRED: 'danger',
    SELECTED: 'success',
}

export const PRC_CONTRACT_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    ACTIVE: 'success',
    EXPIRED: 'warning',
    CANCELLED: 'danger',
}

export const PRC_INVOICE_STATUS: Record<string, PrcBadgeTone> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    POSTED: 'success',
    MATCHED: 'success',
    PARTIALLY_MATCHED: 'warning',
    VARIANCE: 'danger',
    BLOCKED: 'danger',
    EXCEPTION: 'danger',
    CANCELLED: 'danger',
}

export const PRC_EXCEPTION_STATUS: Record<string, PrcBadgeTone> = {
    OPEN: 'danger',
    ACKNOWLEDGED: 'warning',
    RESOLVED: 'success',
    WAIVED: 'default',
}

export const PRC_MATCH_STATUS: Record<string, PrcBadgeTone> = {
    MATCHED: 'success',
    PARTIAL: 'warning',
    PARTIALLY_MATCHED: 'warning',
    EXCEPTION: 'danger',
    VARIANCE: 'danger',
    OPEN: 'info',
    UNMATCHED: 'default',
}

const PULSE = new Set([
    'PENDING_APPROVAL',
    'SUBMITTED',
    'OPEN',
    'EVALUATION',
    'PARTIALLY_RESPONDED',
    'PARTIALLY_RECEIVED',
    'PARTIALLY_MATCHED',
    'VARIANCE',
    'BLOCKED',
    'EXCEPTION',
    'OPEN',
])

export function prcStatusTone(status: string, map?: Record<string, PrcBadgeTone>): PrcBadgeTone {
    return map?.[status] ?? 'default'
}

export function PrcAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone: PrcBadgeTone
}) {
    const label = status.replace(/_/g, ' ')
    const pulse = PULSE.has(status)
    return (
        <StatusBadge
            tone={tone}
            className={pulse ? 'animate-mm-status-pulse motion-reduce:animate-none' : undefined}
        >
            {label}
        </StatusBadge>
    )
}

export function PrcTypeTag({ label }: { label: string }) {
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label}
        </Tag>
    )
}
