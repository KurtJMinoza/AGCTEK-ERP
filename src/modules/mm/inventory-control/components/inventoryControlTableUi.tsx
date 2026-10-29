'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineClipboardCheck,
    HiOutlineCollection,
    HiOutlineScale,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import {
    RcvPartyCell,
} from '@/modules/mm/receiving/components/receivingTableUi'
import {
    SmEntityCell,
    SmUnitPriceCell,
} from '@/modules/mm/supplier-management/components/SupplierTableCells'

export { fmtRcvDate as fmtIcDate, RcvPartyCell as IcPartyCell }

export type IcBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function icTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function icIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type IcDocIcon = 'count' | 'rule' | 'variance'

const DOC_ICONS: Record<IcDocIcon, typeof HiOutlineClipboardCheck> = {
    count: HiOutlineClipboardCheck,
    rule: HiOutlineCollection,
    variance: HiOutlineScale,
}

export function IcDocCell({
    primary,
    secondary,
    icon = 'count',
}: {
    primary: string
    secondary?: string | null
    icon?: IcDocIcon
}) {
    const Icon = DOC_ICONS[icon]
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${icIconPopClass(70)}`}
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
}

export function IcMaterialCell({
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

export function IcPlainCell({
    children,
    mono,
    muted,
    clamp,
}: {
    children?: ReactNode
    mono?: boolean
    muted?: boolean
    clamp?: boolean
}) {
    if (children == null || children === '') {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <span
            className={`block max-w-[16rem] text-sm ${
                clamp ? 'line-clamp-2 text-xs' : 'truncate'
            } ${mono ? 'font-mono text-xs' : ''} ${
                muted ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'
            }`}
        >
            {children}
        </span>
    )
}

export function IcQtyCell({
    value,
    emphasize,
}: {
    value?: number | string | null
    emphasize?: 'positive' | 'negative'
}) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n)
            ? n.toLocaleString(undefined, { maximumFractionDigits: 6 })
            : '—'
    const tone =
        emphasize === 'negative'
            ? 'text-rose-600 dark:text-rose-400'
            : emphasize === 'positive'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-gray-900 dark:text-gray-100'
    return (
        <span className={`text-sm font-semibold tabular-nums ${tone}`}>{formatted}</span>
    )
}

export function IcMoneyCell({ amount }: { amount?: number | string | null }) {
    const n = amount != null && amount !== '' ? Number(amount) : null
    if (n == null || !Number.isFinite(n)) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return <SmUnitPriceCell amount={n} currencyCode="Value" />
}

export function IcMethodTag({ label }: { label?: string | null }) {
    if (!label) return <IcPlainCell muted>—</IcPlainCell>
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label.replace(/_/g, ' ')}
        </Tag>
    )
}

export const IC_COUNT_STATUS: Record<string, IcBadgeTone> = {
    OPEN: 'default',
    COUNTING: 'info',
    RECOUNT: 'warning',
    APPROVAL: 'warning',
    POSTED: 'success',
    CLOSED: 'success',
    DRAFT: 'default',
}

export const IC_VARIANCE_STATUS: Record<string, IcBadgeTone> = {
    OPEN: 'default',
    RECOUNT_REQUIRED: 'warning',
    INVESTIGATED: 'success',
    CLEARED: 'default',
    ADJUSTED: 'success',
    REQUIRE_RECOUNT: 'warning',
    RECOUNTED: 'info',
    COUNTED: 'info',
    APPROVED: 'success',
}

const PULSE = new Set(['OPEN', 'COUNTING', 'APPROVAL', 'RECOUNT_REQUIRED', 'PENDING_APPROVAL'])

export function icStatusTone(status: string, map?: Record<string, IcBadgeTone>): IcBadgeTone {
    return map?.[status] ?? 'default'
}

export function IcAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone?: IcBadgeTone
}) {
    const resolved = tone ?? icStatusTone(status)
    const label = status.replace(/_/g, ' ')
    const pulse = PULSE.has(status)
    return (
        <StatusBadge
            tone={resolved}
            className={pulse ? 'animate-mm-status-pulse motion-reduce:animate-none' : undefined}
        >
            {label}
        </StatusBadge>
    )
}
