'use client'

import type { ReactNode } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineShieldCheck,
} from 'react-icons/hi'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'

export { fmtRcvDate as fmtSopDate }

export type SopBadgeTone = 'success' | 'default' | 'warning' | 'danger' | 'info'

export function sopTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

function sopIconPopClass(extraDelayMs = 0): string {
    return [
        'animate-mm-icon-pop motion-reduce:animate-none opacity-0',
        extraDelayMs > 0 ? `[animation-delay:${extraDelayMs}ms]` : '',
        'transition-transform duration-200 group-hover/row:scale-105',
    ]
        .filter(Boolean)
        .join(' ')
}

type SopDocIcon = 'document' | 'audit' | 'compliance'

const DOC_ICONS: Record<SopDocIcon, typeof HiOutlineDocumentText> = {
    document: HiOutlineDocumentText,
    audit: HiOutlineClipboardList,
    compliance: HiOutlineShieldCheck,
}

export function SopDocCell({
    primary,
    secondary,
    icon = 'document',
}: {
    primary: string
    secondary?: string | null
    icon?: SopDocIcon
}) {
    const Icon = DOC_ICONS[icon]
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${sopIconPopClass(70)}`}
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

export function SopPlainCell({
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
            className={`block max-w-[16rem] truncate text-sm ${
                mono ? 'font-mono text-xs' : ''
            } ${muted ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}
        >
            {children}
        </span>
    )
}

export function SopDateCell({ iso }: { iso?: string | null }) {
    const text = fmtRcvDate(iso, true)
    if (text === '—') return <span className="text-sm text-gray-400">—</span>
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {text}
        </span>
    )
}

export function SopMethodTag({ label }: { label?: string | null }) {
    if (!label) return <SopPlainCell muted>—</SopPlainCell>
    return (
        <Tag className="border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide dark:border-gray-600 dark:bg-gray-800/60">
            {label.replace(/_/g, ' ')}
        </Tag>
    )
}

export const SOP_DOCUMENT_STATUS: Record<string, SopBadgeTone> = {
    DRAFT: 'default',
    IN_REVIEW: 'warning',
    APPROVED: 'success',
    EFFECTIVE: 'success',
    OBSOLETE: 'default',
    EXPIRED: 'danger',
}

export const SOP_AUDIT_ACTION: Record<string, SopBadgeTone> = {
    CREATE: 'info',
    UPDATE: 'warning',
    DELETE: 'danger',
    APPROVE: 'success',
    POST: 'success',
    REVERSE: 'warning',
    SUBMIT: 'info',
}

const PULSE = new Set(['IN_REVIEW', 'DRAFT', 'OPEN', 'PENDING'])

export function sopStatusTone(status: string, map?: Record<string, SopBadgeTone>): SopBadgeTone {
    return map?.[status] ?? 'default'
}

export function SopAnimatedStatus({
    status,
    tone,
}: {
    status: string
    tone?: SopBadgeTone
}) {
    const resolved = tone ?? sopStatusTone(status)
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

export function sopMetricEnterClass(index: number): string {
    const delay = Math.min(index, 8) * 50
    return [
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
    ].join(' ')
}
