'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineBeaker,
    HiOutlineClipboardCheck,
    HiOutlineClipboardList,
    HiOutlineCube,
    HiOutlineDocumentText,
    HiOutlineExclamation,
    HiOutlineLocationMarker,
    HiOutlineShieldExclamation,
    HiOutlineTruck,
    HiOutlineUser,
} from 'react-icons/hi'
import type { ReactNode } from 'react'

export type RcvBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function rcvTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function rcvMobileCardEnterClass(index: number): string {
    const delay = Math.min(index, 10) * 55
    return `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${delay}ms]`
}

export function rcvIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

export function fmtRcvDate(iso?: string | null, withTime = false) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    })
}

export const RCV_EXPECTED_RECEIPT_STATUS: Record<string, RcvBadgeTone> = {
    OPEN: 'info',
    IN_PROGRESS: 'warning',
    CLOSED: 'success',
    CANCELLED: 'danger',
}

export const RCV_ASN_STATUS: Record<string, RcvBadgeTone> = {
    DRAFT: 'default',
    CONFIRMED: 'success',
    CANCELLED: 'danger',
}

export const RCV_INSPECTION_LOT_STATUS: Record<string, RcvBadgeTone> = {
    CREATED: 'info',
    READY: 'info',
    PENDING: 'warning',
    IN_PROGRESS: 'warning',
    PENDING_DECISION: 'warning',
    DECIDED: 'success',
    CLOSED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    PASS: 'success',
    FAIL: 'danger',
    PARTIAL_PASS: 'warning',
}

export const RCV_INSPECTION_RESULT: Record<string, RcvBadgeTone> = {
    ACCEPT: 'success',
    ACCEPTED: 'success',
    REJECT: 'danger',
    REJECTED: 'danger',
    RETURN: 'warning',
    RETURN_TO_VENDOR: 'warning',
    SCRAP: 'danger',
    REWORK: 'warning',
}

export const RCV_HOLD_STATUS: Record<string, RcvBadgeTone> = {
    ACTIVE: 'warning',
    RELEASED: 'success',
    CANCELLED: 'default',
}

export const RCV_VARIANCE_STATUS: Record<string, RcvBadgeTone> = {
    OPEN: 'warning',
    RESOLVED: 'success',
    DISMISSED: 'default',
}

export const RCV_QI_STATUS: Record<string, RcvBadgeTone> = {
    PENDING: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

export const RCV_SUPPLIER_RETURN_STATUS: Record<string, RcvBadgeTone> = {
    DRAFT: 'default',
    SUBMITTED: 'warning',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    SHIPPED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

export const RCV_USAGE_DECISION: Record<string, RcvBadgeTone> = {
    ACCEPT: 'success',
    ACCEPT_WITH_DEVIATION: 'warning',
    BLOCK: 'danger',
    REJECT: 'danger',
    RETURN: 'warning',
    SCRAP: 'danger',
    REWORK: 'warning',
}

const PULSE_STATUSES = new Set([
    'OPEN',
    'IN_PROGRESS',
    'PENDING',
    'PENDING_DECISION',
    'ACTIVE',
    'DRAFT',
    'PENDING_APPROVAL',
])

export function rcvStatusTone(
    status: string,
    map?: Record<string, RcvBadgeTone>,
): RcvBadgeTone {
    return map?.[status] ?? 'default'
}

type RcvDocIcon = 'receipt' | 'asn' | 'gr' | 'inspection' | 'nc' | 'return'

const DOC_ICONS: Record<RcvDocIcon, typeof HiOutlineDocumentText> = {
    receipt: HiOutlineDocumentText,
    asn: HiOutlineTruck,
    gr: HiOutlineClipboardCheck,
    inspection: HiOutlineClipboardList,
    nc: HiOutlineExclamation,
    return: HiOutlineTruck,
}

export function RcvDocNumberCell({
    primary,
    secondary,
    icon = 'receipt',
    onClick,
}: {
    primary: string
    secondary?: string | null
    icon?: RcvDocIcon
    onClick?: () => void
}) {
    const Icon = DOC_ICONS[icon]
    const inner = (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${rcvIconPopClass(70)}`}
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

export function RcvPartyCell({
    name,
    subtitle,
    kind = 'supplier',
}: {
    name?: string | null
    subtitle?: string | null
    kind?: 'supplier' | 'warehouse' | 'user'
}) {
    if (!name?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    const Icon =
        kind === 'warehouse'
            ? HiOutlineLocationMarker
            : kind === 'user'
              ? HiOutlineUser
              : HiOutlineUser
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {kind === 'supplier' && initials ? initials : <Icon className="text-sm" />}
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
                {subtitle ? (
                    <p className="truncate font-mono text-[11px] text-gray-500">{subtitle}</p>
                ) : null}
            </div>
        </div>
    )
}

export function RcvMaterialCell({
    code,
    name,
}: {
    code?: string | null
    name?: string | null
}) {
    if (!code && !name) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <HiOutlineCube className="text-sm" />
            </span>
            <div className="min-w-0">
                {code ? (
                    <p className="truncate font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {code}
                    </p>
                ) : null}
                {name ? (
                    <p className="truncate text-sm text-gray-900 dark:text-gray-100">{name}</p>
                ) : null}
            </div>
        </div>
    )
}

export function RcvCodeCell({
    code,
    description,
}: {
    code: string
    description?: string | null
}) {
    return (
        <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-primary">{code}</p>
            {description ? (
                <p className="truncate text-sm text-gray-700 dark:text-gray-300">{description}</p>
            ) : null}
        </div>
    )
}

export function RcvQtyCell({
    value,
    label,
}: {
    value?: number | string | null
    label?: string
}) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'
    return (
        <div className="min-w-[3.5rem]">
            <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatted}
            </p>
            {label ? (
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            ) : null}
        </div>
    )
}

export function RcvDateCell({ iso, withTime }: { iso?: string | null; withTime?: boolean }) {
    const text = fmtRcvDate(iso, withTime)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function RcvPlainCell({
    children,
    mono,
    muted,
}: {
    children: ReactNode
    mono?: boolean
    muted?: boolean
}) {
    if (children == null || children === '') {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <span
            className={`block max-w-[12rem] truncate text-sm ${
                mono ? 'font-mono text-xs' : ''
            } ${muted ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}
        >
            {children}
        </span>
    )
}

export function RcvSourceTag({
    sourceType,
    ref,
}: {
    sourceType?: string | null
    ref?: string | null
}) {
    if (!sourceType && !ref) return <span className="text-sm text-gray-400">—</span>
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
            {sourceType ? (
                <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
                    {sourceType}
                </Tag>
            ) : null}
            {ref ? (
                <span className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    {ref}
                </span>
            ) : null}
        </div>
    )
}

export function RcvCarrierCell({
    carrier,
    tracking,
}: {
    carrier?: string | null
    tracking?: string | null
}) {
    if (!carrier && !tracking) return <span className="text-sm text-gray-400">—</span>
    return (
        <div className="min-w-0">
            {carrier ? (
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {carrier}
                </p>
            ) : null}
            {tracking ? (
                <p className="truncate font-mono text-[11px] text-gray-500">{tracking}</p>
            ) : null}
        </div>
    )
}

export function RcvAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone: RcvBadgeTone
}) {
    const pulse = PULSE_STATUSES.has(status)
    return (
        <StatusBadge
            tone={tone}
            className={pulse ? 'animate-mm-status-pulse motion-reduce:animate-none' : undefined}
        >
            {status.replace(/_/g, ' ')}
        </StatusBadge>
    )
}

export function RcvSeverityCell({ severity }: { severity?: string | null }) {
    if (!severity) return <span className="text-sm text-gray-400">—</span>
    const tone: RcvBadgeTone =
        severity === 'CRITICAL' || severity === 'HIGH'
            ? 'danger'
            : severity === 'MEDIUM'
              ? 'warning'
              : 'default'
    return <RcvAnimatedStatus status={severity} tone={tone} />
}

export function RcvPlanCell({ planCode, name }: { planCode: string; name?: string | null }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                <HiOutlineBeaker className="text-sm" />
            </span>
            <RcvCodeCell code={planCode} description={name} />
        </div>
    )
}

export function RcvHoldReasonCell({ reason }: { reason?: string | null }) {
    if (!reason) return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <HiOutlineShieldExclamation className="shrink-0 text-sm" />
            <span className="truncate max-w-[10rem]">{reason.replace(/_/g, ' ')}</span>
        </span>
    )
}
