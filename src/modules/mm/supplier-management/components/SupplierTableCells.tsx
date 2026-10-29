'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineCube,
    HiOutlineLink,
    HiOutlineStar,
    HiOutlineTruck,
    HiOutlineUser,
} from 'react-icons/hi'

export function smTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function smIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

export function SmSupplierLinkCodeCell({ code }: { code?: string | null }) {
    if (!code?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${smIconPopClass(70)}`}
            >
                <HiOutlineLink className="text-base" />
            </span>
            <span className="truncate font-mono text-xs font-semibold text-primary">
                {code}
            </span>
        </div>
    )
}

export function SmSupplierIdentityCell({
    code,
    name,
    onClick,
}: {
    code: string
    name: string
    onClick?: () => void
}) {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${smIconPopClass(70)}`}
            >
                {initials || <HiOutlineUser className="text-sm" />}
            </span>
            <div className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-primary">
                    {code}
                </span>
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
            </div>
        </div>
    )
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="w-full max-w-[16rem] rounded-lg text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
                {inner}
            </button>
        )
    }
    return inner
}

export function SmPlainCell({
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

export function SmContactCell({
    name,
    email,
}: {
    name?: string | null
    email?: string | null
}) {
    if (!name && !email) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="min-w-0 max-w-[12rem]">
            {name ? (
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
            ) : null}
            {email ? (
                <p className="truncate text-[11px] text-gray-500">{email}</p>
            ) : null}
        </div>
    )
}

export function SmCodeNameCell({
    code,
    name,
    description,
}: {
    code: string
    name?: string | null
    description?: string | null
}) {
    return (
        <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-primary">{code}</p>
            {name ? (
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
            ) : null}
            {description ? (
                <p className="line-clamp-2 text-[11px] text-gray-500">{description}</p>
            ) : null}
        </div>
    )
}

export function SmScoreCell({
    value,
    label,
    emphasize,
}: {
    value: number | string
    label?: string
    emphasize?: boolean
}) {
    const n = Number(value)
    const text = Number.isFinite(n) ? n.toFixed(1) : '—'
    return (
        <div className="min-w-[3rem]">
            <p
                className={`tabular-nums ${
                    emphasize
                        ? 'text-base font-bold text-primary'
                        : 'text-sm font-semibold text-gray-900 dark:text-gray-100'
                }`}
            >
                {text}
            </p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

export function SmPeriodCell({
    start,
    end,
}: {
    start?: string | null
    end?: string | null
}) {
    const from = start ? String(start).slice(0, 10) : null
    const to = end ? String(end).slice(0, 10) : null
    if (!from && !to) return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-xs tabular-nums text-gray-700 dark:text-gray-300">
            {from ?? '…'} → {to ?? '…'}
        </span>
    )
}

export function SmPaymentDiscountCell({
    discountDays,
    discountPercent,
    dueDays,
}: {
    discountDays?: number | null
    discountPercent?: number | string | null
    dueDays?: number | null
}) {
    if (discountDays) {
        return (
            <Tag className="border-emerald-200/80 bg-emerald-50 text-[11px] font-medium text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                {discountPercent}% / {discountDays}d
            </Tag>
        )
    }
    if (dueDays != null) {
        return (
            <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                Net {dueDays}d
            </span>
        )
    }
    return <span className="text-sm text-gray-400">—</span>
}

export function SmEntityCell({
    primary,
    secondary,
    kind,
}: {
    primary?: string | null
    secondary?: string | null
    kind: 'supplier' | 'material'
}) {
    if (!primary?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const Icon = kind === 'material' ? HiOutlineCube : HiOutlineUser
    const initials = primary
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {kind === 'supplier' && initials ? initials : <Icon className="text-sm" />}
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {primary}
                </p>
                {secondary ? (
                    <p className="truncate font-mono text-[11px] text-gray-500">
                        {secondary}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function SmUnitPriceCell({
    amount,
    currencyCode,
}: {
    amount: number | string
    currencyCode?: string | null
}) {
    const n = Number(amount)
    const formatted = Number.isFinite(n)
        ? n.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          })
        : '—'
    return (
        <div className="min-w-0">
            <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatted}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {currencyCode?.trim() || 'Unit price'}
            </p>
        </div>
    )
}

export function SmSupplyTermsCell({
    moq,
    leadTimeDays,
}: {
    moq?: number | string | null
    leadTimeDays?: number | null
}) {
    const moqNum = moq != null && moq !== '' ? Number(moq) : null
    const hasMoq = moqNum != null && Number.isFinite(moqNum)
    const hasLead = leadTimeDays != null && leadTimeDays > 0
    if (!hasMoq && !hasLead) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="flex flex-wrap gap-1.5">
            {hasMoq ? (
                <Tag className="border-gray-200 bg-gray-50 text-[11px] font-medium dark:border-gray-600 dark:bg-gray-800/60">
                    MOQ {moqNum!.toLocaleString()}
                </Tag>
            ) : null}
            {hasLead ? (
                <Tag className="gap-1 border-amber-200/80 bg-amber-50 text-[11px] font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <HiOutlineTruck className="text-sm" />
                    {leadTimeDays}d lead
                </Tag>
            ) : null}
        </div>
    )
}

function formatShortDate(iso?: string | null) {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
}

export function SmValidityCell({
    start,
    end,
}: {
    start?: string | null
    end?: string | null
}) {
    const from = formatShortDate(start)
    const to = formatShortDate(end)
    if (!from && !to) {
        return <span className="text-sm text-gray-400">Open-ended</span>
    }
    return (
        <div className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
            {from ? (
                <p>
                    <span className="text-gray-400">From </span>
                    {from}
                </p>
            ) : null}
            {to ? (
                <p>
                    <span className="text-gray-400">To </span>
                    {to}
                </p>
            ) : (
                <p className="text-emerald-600 dark:text-emerald-400">No end date</p>
            )}
        </div>
    )
}

export function SmPreferredCell({ preferred }: { preferred: boolean }) {
    if (!preferred) {
        return (
            <span className="text-xs text-gray-400">Standard</span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            <HiOutlineStar className="text-sm" />
            Preferred
        </span>
    )
}

export const SM_RECORD_STATUS: Record<
    string,
    'success' | 'default' | 'warning' | 'danger' | 'info'
> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
    DRAFT: 'default',
    PENDING_REVIEW: 'info',
    APPROVED: 'info',
    BLOCKED: 'danger',
    OPEN: 'warning',
    ACKNOWLEDGED: 'info',
    DISMISSED: 'default',
}

const PULSE_STATUSES = new Set([
    'PENDING_REVIEW',
    'OPEN',
    'DRAFT',
    'ACTIVE',
])

export function SmAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone: 'success' | 'default' | 'warning' | 'danger' | 'info'
}) {
    const label = status.replace(/_/g, ' ')
    const pulse = PULSE_STATUSES.has(status)
    return (
        <StatusBadge
            tone={tone}
            className={pulse ? 'animate-mm-status-pulse motion-reduce:animate-none' : undefined}
        >
            {label}
        </StatusBadge>
    )
}

export function SmRecordStatusCell({ status }: { status: string }) {
    return (
        <SmAnimatedStatus
            status={status}
            tone={SM_RECORD_STATUS[status] ?? 'default'}
        />
    )
}
