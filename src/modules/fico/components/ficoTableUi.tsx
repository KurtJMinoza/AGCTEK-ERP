'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineBookOpen,
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineHashtag,
} from 'react-icons/hi'

export type FicoBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function ficoTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function iconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

export const FICO_RECORD_STATUS: Record<string, FicoBadgeTone> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
    DRAFT: 'default',
}

export const FICO_PERIOD_STATUS: Record<string, FicoBadgeTone> = {
    FUTURE: 'default',
    OPEN: 'success',
    RESTRICTED: 'warning',
    CLOSED: 'info',
    LOCKED: 'danger',
}

export function ficoStatusTone(status: string, map = FICO_RECORD_STATUS): FicoBadgeTone {
    return map[status] ?? 'default'
}

export function FicoStatusCell({
    status,
    map = FICO_RECORD_STATUS,
}: {
    status: string
    map?: Record<string, FicoBadgeTone>
}) {
    return (
        <StatusBadge tone={ficoStatusTone(status, map)}>
            {status.replace(/_/g, ' ')}
        </StatusBadge>
    )
}

type FicoCodeIcon = 'chart' | 'group' | 'account' | 'calendar' | 'posting'

const CODE_ICONS: Record<FicoCodeIcon, typeof HiOutlineBookOpen> = {
    chart: HiOutlineBookOpen,
    group: HiOutlineCollection,
    account: HiOutlineHashtag,
    calendar: HiOutlineCalendar,
    posting: HiOutlineClipboardList,
}

/** Code + name identity cell with an optional click target and tree indent. */
export function FicoCodeCell({
    code,
    name,
    icon = 'chart',
    depth = 0,
    onClick,
}: {
    code: string
    name?: string | null
    icon?: FicoCodeIcon
    depth?: number
    onClick?: () => void
}) {
    const Icon = CODE_ICONS[icon]
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${iconPopClass(70)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-primary">
                    {code}
                </span>
                {name ? (
                    <p className="truncate text-sm text-gray-900 dark:text-gray-100">{name}</p>
                ) : null}
            </div>
        </div>
    )
    const indent = depth > 0 ? { paddingLeft: depth * 20 } : undefined
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                style={indent}
                className="w-full max-w-[18rem] rounded-lg text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
                {inner}
            </button>
        )
    }
    return <div style={indent}>{inner}</div>
}

const ACCOUNT_TYPE_CLASS: Record<string, string> = {
    ASSET: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200',
    LIABILITY: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    EQUITY: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200',
    REVENUE: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    EXPENSE: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
}

export function accountTypeLabel(type: string) {
    return type.charAt(0) + type.slice(1).toLowerCase()
}

export function FicoAccountTypeTag({ type }: { type: string }) {
    return (
        <Tag
            className={`text-[11px] font-semibold ${ACCOUNT_TYPE_CLASS[type] ?? ''}`}
        >
            {accountTypeLabel(type)}
        </Tag>
    )
}

function naturalBalance(type: string) {
    return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
}

/** Normal balance, flagged when it is a contra account (opposite of the type's natural side). */
export function FicoBalanceCell({
    normalBalance,
    accountType,
}: {
    normalBalance: string
    accountType: string
}) {
    const contra = normalBalance !== naturalBalance(accountType)
    return (
        <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {normalBalance === 'DEBIT' ? 'Debit' : 'Credit'}
            </p>
            {contra ? (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                    Contra
                </p>
            ) : null}
        </div>
    )
}

export function FicoRangeCell({
    rangeFrom,
    rangeTo,
}: {
    rangeFrom?: string | null
    rangeTo?: string | null
}) {
    if (!rangeFrom || !rangeTo) {
        return <span className="text-xs text-gray-400">Any code</span>
    }
    return (
        <span className="whitespace-nowrap rounded-md bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {rangeFrom} – {rangeTo}
        </span>
    )
}

export function FicoCountCell({
    value,
    label,
}: {
    value?: number | null
    label?: string
}) {
    return (
        <div className="min-w-[3rem]">
            <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {(value ?? 0).toLocaleString()}
            </p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

/** Compact posting-control chips (posting / manual / automatic / reconciliation). */
export function FicoControlFlags({ flags }: { flags: Array<string | false | null | undefined> }) {
    const shown = flags.filter(Boolean) as string[]
    if (!shown.length) return <span className="text-xs text-gray-400">—</span>
    return (
        <div className="flex max-w-[14rem] flex-wrap gap-1">
            {shown.map((flag) => (
                <span
                    key={flag}
                    className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300"
                >
                    {flag}
                </span>
            ))}
        </div>
    )
}

export function FicoTwoLineCell({
    primary,
    secondary,
    mono,
}: {
    primary?: ReactNode
    secondary?: ReactNode
    mono?: boolean
}) {
    if (primary == null || primary === '') {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="min-w-0">
            <p
                className={`truncate text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono text-xs font-semibold' : ''}`}
            >
                {primary}
            </p>
            {secondary ? (
                <p className="truncate text-[11px] text-gray-500">{secondary}</p>
            ) : null}
        </div>
    )
}

export function formatFicoDate(value?: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

/** Status mix chips, e.g. "OPEN 1 · FUTURE 11". */
export function FicoStatusMix({ statuses }: { statuses: Record<string, number> }) {
    const entries = Object.entries(statuses)
    if (!entries.length) return <span className="text-xs text-gray-400">—</span>
    return (
        <div className="flex flex-wrap gap-1">
            {entries.map(([status, count]) => (
                <StatusBadge key={status} tone={ficoStatusTone(status, FICO_PERIOD_STATUS)}>
                    {status.toLowerCase()} {count}
                </StatusBadge>
            ))}
        </div>
    )
}
