'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineChip,
    HiOutlineCollection,
    HiOutlineDeviceMobile,
    HiOutlineQrcode,
    HiOutlineTag,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import {
    SmEntityCell,
} from '@/modules/mm/supplier-management/components/SupplierTableCells'

export { fmtRcvDate as fmtBcDate }

export type BcBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function bcTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function bcIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type BcScanIcon = 'barcode' | 'rfid' | 'device' | 'batch' | 'serial'

const SCAN_ICONS: Record<BcScanIcon, typeof HiOutlineQrcode> = {
    barcode: HiOutlineQrcode,
    rfid: HiOutlineChip,
    device: HiOutlineDeviceMobile,
    batch: HiOutlineCollection,
    serial: HiOutlineTag,
}

export function BcScanIdCell({
    primary,
    secondary,
    icon = 'barcode',
}: {
    primary: string
    secondary?: string | null
    icon?: BcScanIcon
}) {
    const Icon = SCAN_ICONS[icon]
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${bcIconPopClass(70)}`}
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

export function BcMaterialCell({
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

export function BcPlainCell({
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

export function BcDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso, true)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function BcQtyCell({ value }: { value?: number | string | null }) {
    const n = value != null && value !== '' ? Number(value) : null
    const formatted =
        n != null && Number.isFinite(n)
            ? n.toLocaleString(undefined, { maximumFractionDigits: 6 })
            : '—'
    return (
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {formatted}
        </span>
    )
}

export function BcMethodTag({ label }: { label?: string | null }) {
    if (!label) return <BcPlainCell muted>—</BcPlainCell>
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label.replace(/_/g, ' ')}
        </Tag>
    )
}

export const BC_REGISTRY_STATUS: Record<string, BcBadgeTone> = {
    ACTIVE: 'success',
    ARCHIVED: 'default',
    INACTIVE: 'default',
}

export const BC_RFID_STATUS: Record<string, BcBadgeTone> = {
    ASSIGNED: 'success',
    UNASSIGNED: 'warning',
    LOST: 'danger',
    REVOKED: 'danger',
}

export const BC_DEVICE_STATUS: Record<string, BcBadgeTone> = {
    ACTIVE: 'success',
    IDLE: 'info',
    REVOKED: 'danger',
    OFFLINE: 'default',
}

const PULSE = new Set(['ACTIVE', 'UNASSIGNED', 'IDLE'])

export function bcStatusTone(status: string, map?: Record<string, BcBadgeTone>): BcBadgeTone {
    return map?.[status] ?? 'default'
}

export function BcAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone?: BcBadgeTone
}) {
    const resolved = tone ?? bcStatusTone(status)
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
