'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    HiOutlineArchive,
    HiOutlineClipboardList,
    HiOutlineInboxIn,
    HiOutlineSwitchHorizontal,
    HiOutlineUpload,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import { DOC_STATUS_TONE, docStatusLabel } from '../utils/inventoryUi'

export { fmtRcvDate as fmtInvDate }

export type InvBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function invTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function invIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type InvDocIcon = 'gr' | 'gi' | 'adj' | 'xfer' | 'ledger' | 'reservation'

const DOC_ICONS: Record<InvDocIcon, typeof HiOutlineClipboardList> = {
    gr: HiOutlineInboxIn,
    gi: HiOutlineUpload,
    adj: HiOutlineArchive,
    xfer: HiOutlineSwitchHorizontal,
    ledger: HiOutlineClipboardList,
    reservation: HiOutlineArchive,
}

export function InvDocNumberCell({
    primary,
    secondary,
    icon = 'ledger',
    onClick,
}: {
    primary: string
    secondary?: string | null
    icon?: InvDocIcon
    onClick?: () => void
}) {
    const Icon = DOC_ICONS[icon]
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${invIconPopClass(70)}`}
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

export function InvPlainCell({
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

export function InvDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function InvQtyCell({ value, label }: { value?: number | string | null; label?: string }) {
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

const DOC_PULSE = new Set([
    'PENDING_APPROVAL',
    'IN_TRANSIT',
    'OPEN',
    'PARTIAL',
    'PICKED',
    'APPROVED',
])

export function InvAnimatedStatus({ status }: { status?: string | null }) {
    const code = status ?? ''
    const tone = DOC_STATUS_TONE[code] ?? 'default'
    const label = docStatusLabel(code)
    const pulse = DOC_PULSE.has(code)
    return (
        <StatusBadge
            tone={tone}
            className={pulse ? 'animate-mm-status-pulse motion-reduce:animate-none' : undefined}
        >
            {label}
        </StatusBadge>
    )
}
