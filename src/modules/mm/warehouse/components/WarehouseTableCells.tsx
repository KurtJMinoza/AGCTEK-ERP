'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import {
    HiOutlineClipboardList,
    HiOutlineCube,
    HiOutlineLocationMarker,
    HiOutlineUser,
} from 'react-icons/hi'

/** Staggered row entrance for warehouse DataTables (pair with DataTable rowClassName). */
export function wmTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 12) * 45
    return `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${delay}ms]`
}

type WmDocNumberCellProps = {
    primary: string
    secondary?: string | null
    icon?: 'pick' | 'pack'
    extraCount?: number
    onClick?: () => void
}

export function WmDocNumberCell({
    primary,
    secondary,
    icon = 'pick',
    extraCount,
    onClick,
}: WmDocNumberCellProps) {
    const Icon = icon === 'pack' ? HiOutlineCube : HiOutlineClipboardList
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-semibold text-primary">
                        {primary}
                    </span>
                    {extraCount && extraCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            +{extraCount}
                        </span>
                    ) : null}
                </div>
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
                className="w-full rounded-lg text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
                {inner}
            </button>
        )
    }
    return inner
}

type WmPartyCellProps = {
    name?: string | null
    subtitle?: string | null
}

export function WmPartyCell({ name, subtitle }: WmPartyCellProps) {
    if (!name) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {initials || <HiOutlineUser className="text-sm" />}
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
                {subtitle ? (
                    <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
                ) : null}
            </div>
        </div>
    )
}

export function WmBinChip({ code }: { code?: string | null }) {
    if (!code) return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-200">
            <HiOutlineLocationMarker className="shrink-0 text-sm text-primary" />
            {code}
        </span>
    )
}

type WmProductLineCellProps = {
    name: string
    code?: string | null
    hint?: string | null
}

export function WmProductLineCell({ name, code, hint }: WmProductLineCellProps) {
    return (
        <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={name}>
                {code ? (
                    <>
                        <span className="font-mono text-xs text-gray-500">{code}</span>
                        <span className="mx-1 text-gray-300">·</span>
                    </>
                ) : null}
                {name}
            </p>
            {hint ? (
                <span className="text-xs text-amber-600 dark:text-amber-300">{hint}</span>
            ) : null}
        </div>
    )
}

type WmProgressQtyCellProps = {
    done: number
    total: number
    label?: string
    tone?: 'pick' | 'pack'
}

export function WmProgressQtyCell({
    done,
    total,
    label,
    tone = 'pick',
}: WmProgressQtyCellProps) {
    const safeTotal = Math.max(total, 0)
    const safeDone = Math.min(Math.max(done, 0), safeTotal || done)
    const pct = safeTotal > 0 ? Math.min(100, (safeDone / safeTotal) * 100) : 0
    const complete = safeTotal > 0 && safeDone >= safeTotal
    const barClass =
        tone === 'pack'
            ? complete
                ? 'bg-emerald-500'
                : 'bg-amber-500'
            : complete
              ? 'bg-emerald-500'
              : 'bg-primary'

    return (
        <div className="min-w-[5.5rem]">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {safeDone.toLocaleString()}
                    <span className="font-normal text-gray-400">
                        {' '}
                        / {safeTotal.toLocaleString()}
                    </span>
                </span>
            </div>
            {label ? (
                <p className="mb-1 truncate text-[10px] uppercase tracking-wide text-gray-400">
                    {label}
                </p>
            ) : null}
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                    className={`h-full origin-left rounded-full ${barClass} animate-mm-progress-grow motion-reduce:animate-none`}
                    style={{ width: `${pct}%`, animationDelay: '120ms' }}
                />
            </div>
        </div>
    )
}

type WmAnimatedStatusProps = {
    status: string
    tone: 'success' | 'default' | 'warning' | 'danger'
}

const PULSE_STATUSES = new Set([
    'IN_PROGRESS',
    'PARTIALLY_PICKED',
    'PACKING',
    'ASSIGNED',
])

export function WmAnimatedStatus({ status, tone }: WmAnimatedStatusProps) {
    const pulse = PULSE_STATUSES.has(status)
    return (
        <span
            className={
                pulse ? 'inline-flex animate-mm-status-pulse motion-reduce:animate-none' : undefined
            }
        >
            <StatusBadge tone={tone}>{status.replace(/_/g, ' ')}</StatusBadge>
        </span>
    )
}

export function WmSalesOrderChip({ orderNumber }: { orderNumber?: string | null }) {
    if (!orderNumber) return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="inline-block max-w-full truncate rounded-md bg-sky-50 px-2 py-1 font-mono text-[11px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            {orderNumber}
        </span>
    )
}

export function WmItemCountBadge({ count, label = 'items' }: { count: number; label?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium tabular-nums dark:border-gray-600">
            <HiOutlineCube className="text-base text-gray-400" />
            {count.toLocaleString()} {label}
        </span>
    )
}
