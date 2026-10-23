'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineMail,
    HiOutlineReceiptTax,
    HiOutlineUser,
} from 'react-icons/hi'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import {
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'

/** Staggered row entrance for SD module DataTables. */
export const sdTableRowEnterClass = wmTableRowEnterClass

export const SD_DATA_TABLE_LAYOUT = {
    compact: true,
    fit: true,
    hoverable: true,
} as const

export function sdTableRowClassName<T>(_row: T, index: number): string {
    return sdTableRowEnterClass(index)
}

export function formatSdMoney(amount: number, currency = 'PHP') {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency,
    }).format(amount)
}

export function formatSdDate(value: string | null | undefined) {
    if (!value) return null
    return new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium' })
}

export function formatSdDateTime(value: string | null | undefined) {
    if (!value) return null
    return new Date(value).toLocaleString('en-PH', {
        dateStyle: 'short',
        timeStyle: 'short',
    })
}

type SdDocCellProps = {
    primary: string
    secondary?: string | null
    icon?: 'order' | 'invoice'
    href?: string
}

export function SdDocCell({
    primary,
    secondary,
    icon = 'order',
    href,
}: SdDocCellProps) {
    const Icon =
        icon === 'invoice' ? HiOutlineReceiptTax : HiOutlineClipboardList
    const body = (
        <div className="flex min-w-0 items-start gap-2.5 py-0.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${wmIconPopClass(70)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-primary">
                    {primary}
                </p>
                {secondary ? (
                    <p className="truncate text-[11px] text-gray-500">
                        {secondary}
                    </p>
                ) : null}
            </div>
        </div>
    )
    if (href) {
        return (
            <Link href={href} className="block min-w-0 hover:opacity-90">
                {body}
            </Link>
        )
    }
    return body
}

type SdCompanyIdentityCellProps = {
    title: string
    subtitle?: string | null
    narrowHint?: string | null
}

export function SdCompanyIdentityCell({
    title,
    subtitle,
    narrowHint,
}: SdCompanyIdentityCellProps) {
    return (
        <div className="min-w-0 py-0.5">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {title}
            </p>
            {subtitle ? (
                <p className="truncate font-mono text-[11px] text-gray-500">
                    {subtitle}
                </p>
            ) : null}
            {narrowHint ? (
                <p className="mt-0.5 truncate text-[11px] text-gray-500 sm:hidden">
                    {narrowHint}
                </p>
            ) : null}
        </div>
    )
}

type SdContactCellProps = {
    name: string
    email?: string | null
    phone?: string | null
}

export function SdContactCell({ name, email, phone }: SdContactCellProps) {
    const line = [email, phone].filter(Boolean).join(' · ')
    return (
        <div className="flex min-w-0 items-start gap-2">
            <span
                className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 sm:flex ${wmIconPopClass(90)}`}
            >
                <HiOutlineUser className="text-base" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
                {line ? (
                    <p className="line-clamp-2 text-[11px] text-gray-500">
                        {line}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function SdMoneyCell({
    amount,
    currency = 'PHP',
    subline,
    emphasize,
    negative,
}: {
    amount: number
    currency?: string
    subline?: ReactNode
    emphasize?: boolean
    negative?: boolean
}) {
    return (
        <div className="min-w-0 whitespace-nowrap">
            <span
                className={
                    negative
                        ? 'text-sm font-bold tabular-nums text-red-600 dark:text-red-400'
                        : emphasize
                          ? 'text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100'
                          : 'text-sm tabular-nums text-gray-700 dark:text-gray-300'
                }
            >
                {formatSdMoney(amount, currency)}
            </span>
            {subline ? (
                <div className="text-[11px] text-gray-500">{subline}</div>
            ) : null}
        </div>
    )
}

export function SdDateCell({
    value,
    withTime,
}: {
    value: string | null | undefined
    withTime?: boolean
}) {
    const label = withTime ? formatSdDateTime(value) : formatSdDate(value)
    return (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
            <HiOutlineCalendar className="shrink-0 text-base text-gray-400" />
            {label ?? '—'}
        </div>
    )
}

export function SdEmailCell({ email }: { email: string | null | undefined }) {
    if (!email) return <span className="text-gray-400">—</span>
    return (
        <span className="inline-flex min-w-0 items-center gap-1 truncate text-sm">
            <HiOutlineMail className="shrink-0 text-gray-400" />
            <span className="truncate">{email}</span>
        </span>
    )
}

export function SdStatusBadgeCell({
    label,
    tone = 'default',
}: {
    label: string
    tone?: StatusTone
}) {
    return (
        <StatusBadge tone={tone} className="max-w-full truncate">
            {label}
        </StatusBadge>
    )
}
