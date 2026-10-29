'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineChartBar,
    HiOutlineClipboardList,
    HiOutlineCube,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineShoppingCart,
    HiOutlineTrendingUp,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'

export { fmtRcvDate as fmtMrpDate }

export type MrpBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function mrpTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function mrpIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type MrpDocIcon =
    | 'run'
    | 'demand'
    | 'requirement'
    | 'projection'
    | 'suggestion'
    | 'reorder'
    | 'shortage'

const DOC_ICONS: Record<MrpDocIcon, typeof HiOutlineClipboardList> = {
    run: HiOutlineLightningBolt,
    demand: HiOutlineTrendingUp,
    requirement: HiOutlineCube,
    projection: HiOutlineChartBar,
    suggestion: HiOutlineShoppingCart,
    reorder: HiOutlineExclamation,
    shortage: HiOutlineExclamation,
}

export function MrpDocNumberCell({
    primary,
    secondary,
    icon = 'requirement',
}: {
    primary: string
    secondary?: string | null
    icon?: MrpDocIcon
}) {
    const Icon = DOC_ICONS[icon]
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${mrpIconPopClass(70)}`}
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

export function MrpMaterialCell({
    code,
    name,
}: {
    code?: string | null
    name?: string | null
}) {
    return <SmEntityCell kind="material" primary={name} secondary={code} />
}

export function MrpPlainCell({
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

export function MrpDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function MrpQtyCell({
    value,
    label,
    emphasize,
}: {
    value?: number | string | null
    label?: string
    emphasize?: 'danger' | 'success' | 'warning'
}) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n)
            ? n.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : '—'
    const toneClass =
        emphasize === 'danger'
            ? 'text-rose-600 dark:text-rose-400'
            : emphasize === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : emphasize === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-gray-100'
    return (
        <div className="min-w-[3rem] text-right">
            <p className={`text-sm font-semibold tabular-nums ${toneClass}`}>{formatted}</p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

export const MRP_RUN_STATUS: Record<string, MrpBadgeTone> = {
    RUNNING: 'warning',
    COMPLETED: 'success',
    FAILED: 'danger',
    PENDING: 'info',
    DRAFT: 'default',
    CANCELLED: 'danger',
}

export const MRP_SUGGESTION_STATUS: Record<string, MrpBadgeTone> = {
    OPEN: 'info',
    CONVERTED: 'success',
    DISMISSED: 'default',
}

export const MRP_FLAG_STATUS: Record<string, MrpBadgeTone> = {
    SHORTAGE: 'danger',
    BELOW_ROP: 'warning',
    BELOW_SAFETY: 'warning',
    OK: 'success',
}

export const MRP_SOURCE_STATUS: Record<string, MrpBadgeTone> = {
    SALES: 'info',
    PRODUCTION: 'info',
    MAINTENANCE: 'default',
    PROJECTS: 'default',
    MANUAL_INTERNAL: 'default',
    FORECAST: 'warning',
    MRP: 'info',
    BOM: 'info',
}

const PULSE = new Set(['RUNNING', 'OPEN', 'SHORTAGE', 'BELOW_ROP', 'BELOW_SAFETY'])

export function mrpStatusTone(status: string, map?: Record<string, MrpBadgeTone>): MrpBadgeTone {
    return map?.[status] ?? 'default'
}

export function MrpAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone?: MrpBadgeTone
}) {
    const resolved = tone ?? mrpStatusTone(status)
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

export function MrpTypeTag({ label }: { label: string }) {
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label}
        </Tag>
    )
}
