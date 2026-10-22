'use client'

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
    const delay = Math.min(index, 12) * 45
    return `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${delay}ms]`
}

export function SmSupplierLinkCodeCell({ code }: { code?: string | null }) {
    if (!code?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                <HiOutlineLink className="text-base" />
            </span>
            <span className="truncate font-mono text-xs font-semibold text-primary">
                {code}
            </span>
        </div>
    )
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

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> =
    {
        ACTIVE: 'success',
        INACTIVE: 'warning',
        DRAFT: 'default',
    }

export function SmRecordStatusCell({ status }: { status: string }) {
    const label = status.replace(/_/g, ' ')
    return (
        <StatusBadge tone={STATUS_TONE[status] ?? 'default'}>{label}</StatusBadge>
    )
}
