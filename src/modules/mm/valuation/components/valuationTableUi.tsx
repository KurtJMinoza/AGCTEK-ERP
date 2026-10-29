'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineCalculator,
    HiOutlineCollection,
    HiOutlineCurrencyDollar,
    HiOutlineDocumentText,
    HiOutlineLibrary,
    HiOutlineScale,
    HiOutlineTruck,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'
import { SmUnitPriceCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'

export { fmtRcvDate as fmtValDate }

export type ValBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function valTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function valIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type ValDocIcon =
    | 'valuation'
    | 'layer'
    | 'transaction'
    | 'standard'
    | 'fifo'
    | 'map'
    | 'landed'
    | 'variance'

const DOC_ICONS: Record<ValDocIcon, typeof HiOutlineDocumentText> = {
    valuation: HiOutlineCalculator,
    layer: HiOutlineLibrary,
    transaction: HiOutlineDocumentText,
    standard: HiOutlineScale,
    fifo: HiOutlineCollection,
    map: HiOutlineCurrencyDollar,
    landed: HiOutlineTruck,
    variance: HiOutlineScale,
}

export function ValDocNumberCell({
    primary,
    secondary,
    icon = 'valuation',
}: {
    primary: string
    secondary?: string | null
    icon?: ValDocIcon
}) {
    const Icon = DOC_ICONS[icon]
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${valIconPopClass(70)}`}
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

export function ValMaterialCell({
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

export function ValPlainCell({
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

export function ValDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function ValQtyCell({ value, label }: { value?: number | string | null; label?: string }) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n)
            ? n.toLocaleString(undefined, { maximumFractionDigits: 6 })
            : '—'
    return (
        <div className="min-w-[3rem] text-right">
            <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatted}
            </p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

export function ValMoneyCell({
    amount,
    currency,
    emphasize,
}: {
    amount?: number | string | null
    currency?: string | null
    emphasize?: 'positive' | 'negative'
}) {
    const n = amount != null && amount !== '' ? Number(amount) : null
    const tone =
        emphasize === 'negative'
            ? 'text-rose-600 dark:text-rose-400'
            : emphasize === 'positive'
              ? 'text-emerald-600 dark:text-emerald-400'
              : undefined
    if (n == null || !Number.isFinite(n)) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className={tone}>
            <SmUnitPriceCell amount={n} currencyCode={currency ?? 'Amount'} />
        </div>
    )
}

export const VAL_LAYER_STATUS: Record<string, ValBadgeTone> = {
    OPEN: 'info',
    DEPLETED: 'default',
    REVERSED: 'warning',
}

export const VAL_LANDED_STATUS: Record<string, ValBadgeTone> = {
    DRAFT: 'default',
    PREVIEW: 'info',
    ALLOCATED: 'success',
    POSTED: 'success',
    CANCELLED: 'danger',
}

export const VAL_VARIANCE_STATUS: Record<string, ValBadgeTone> = {
    OPEN: 'info',
    POSTED: 'success',
    REVERSED: 'warning',
}

const PULSE = new Set(['OPEN', 'DRAFT', 'RUNNING'])

export function valStatusTone(status: string, map?: Record<string, ValBadgeTone>): ValBadgeTone {
    return map?.[status] ?? 'default'
}

export function ValAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone?: ValBadgeTone
}) {
    const resolved = tone ?? valStatusTone(status)
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

export function ValMethodTag({ method }: { method?: string | null }) {
    if (!method) return <ValPlainCell muted>—</ValPlainCell>
    const label = method.replace(/_/g, ' ')
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label}
        </Tag>
    )
}
