'use client'

import {
    HiOutlineClipboardList,
    HiOutlineHashtag,
    HiOutlineOfficeBuilding,
    HiOutlineTag,
} from 'react-icons/hi'
import type { StatusTone } from '@/components/shared/StatusBadge'
import {
    RcvAnimatedStatus,
    rcvIconPopClass,
    type RcvBadgeTone,
} from '@/modules/mm/receiving/components/receivingTableUi'
import { SdMoneyCell } from './SdDataTableCells'

/** Status metadata shared by the table rows and the mobile cards. */
export const EXT_PLATFORM_STATUS: Record<
    string,
    { label: string; tone: RcvBadgeTone }
> = {
    DRAFT: { label: 'DRAFT', tone: 'default' },
    CONFIRMED: { label: 'CONFIRMED', tone: 'info' },
    APPROVED: { label: 'APPROVED', tone: 'success' },
    CANCELLED: { label: 'CANCELLED', tone: 'danger' },
}

export const extPlatformStatusTone = (status: string): StatusTone =>
    (EXT_PLATFORM_STATUS[status]?.tone ?? 'default') as StatusTone

export function ExtPlatformStatusCell({ status }: { status: string }) {
    const meta = EXT_PLATFORM_STATUS[status] ?? {
        label: status,
        tone: 'default' as RcvBadgeTone,
    }
    return <RcvAnimatedStatus status={meta.label} tone={meta.tone} />
}

export function ExtPlatformRefCell({ value }: { value?: string | null }) {
    if (!value?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300 ${rcvIconPopClass(40)}`}
            >
                <HiOutlineHashtag className="text-sm" />
            </span>
            <p
                className="truncate font-mono text-xs font-semibold text-gray-700 dark:text-gray-200"
                title={value}
            >
                {value}
            </p>
        </div>
    )
}

export function ExtPlatformCompanyCell({
    name,
    code,
}: {
    name?: string | null
    code?: string | null
}) {
    if (!name) return <span className="text-sm text-gray-400">—</span>
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${rcvIconPopClass(55)}`}
            >
                <HiOutlineOfficeBuilding className="text-sm" />
            </span>
            <div className="min-w-0">
                <p
                    className="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                    title={name}
                >
                    {name}
                </p>
                {code ? (
                    <p className="truncate font-mono text-[11px] text-gray-500">{code}</p>
                ) : null}
            </div>
        </div>
    )
}

export function ExtPlatformLinesCell({ count }: { count: number }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700 transition-colors duration-200 group-hover/row:bg-primary-subtle group-hover/row:text-primary-deep dark:bg-gray-800 dark:text-gray-200">
            {count}
            <span className="font-medium text-gray-500">
                {count === 1 ? 'item' : 'items'}
            </span>
        </span>
    )
}

/** Batch / lot values across a transaction's lines (first value + “+N more”). */
export function ExtPlatformTrackingCell({
    values,
    variant,
}: {
    values: string[]
    variant: 'batch' | 'lot'
}) {
    if (!values.length) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const Icon = variant === 'batch' ? HiOutlineClipboardList : HiOutlineTag
    const shell =
        variant === 'batch'
            ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200'
            : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
    return (
        <div className="flex min-w-0 items-center gap-2" title={values.join(', ')}>
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${shell} ${rcvIconPopClass(variant === 'batch' ? 70 : 85)}`}
            >
                <Icon className="text-sm" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                    {values[0]}
                </p>
                {values.length > 1 ? (
                    <p className="text-[10px] text-gray-500">+{values.length - 1} more</p>
                ) : null}
            </div>
        </div>
    )
}

export function ExtPlatformTotalCell({
    total,
    tax,
}: {
    total: number
    tax: number
}) {
    return (
        <SdMoneyCell
            amount={total}
            emphasize
            subline={tax > 0 ? `incl. VAT ${tax.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}` : 'No VAT'}
        />
    )
}

export const uniqueLineValues = (
    lines: Array<{ batchNumber: string | null; lotNumber: string | null }> | undefined,
    key: 'batchNumber' | 'lotNumber',
): string[] => [
    ...new Set(
        (lines ?? [])
            .map((l) => l[key])
            .filter((v): v is string => Boolean(v)),
    ),
]
