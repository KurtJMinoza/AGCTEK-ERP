'use client'

import {
    HiOutlineCalendar,
    HiOutlineCash,
    HiOutlineClipboardList,
    HiOutlineCreditCard,
    HiOutlineDeviceMobile,
    HiOutlineDocumentText,
    HiOutlineDotsCircleHorizontal,
    HiOutlineUser,
} from 'react-icons/hi'
import classNames from '@/utils/classNames'
import Tag from '@/components/ui/Tag'
import {
    CustomerAvatar,
    sharePercent,
} from './SalesAnalysisWidgets'
import { SdMoneyCell, formatSdMoney, sdTableRowClassName } from './SdDataTableCells'
import { wmIconPopClass } from '@/modules/mm/warehouse/components/WarehouseTableCells'
import type { MonthlyCollectionRow } from '../services/monthlyCollectionService'

export type CollectionBucketKey =
    | 'cash'
    | 'gcash'
    | 'bankTransfer'
    | 'cheque'
    | 'others'

const Dash = () => (
    <span className="select-none text-sm text-gray-300 dark:text-gray-600">
        —
    </span>
)

export const BUCKET_VISUAL: Record<
    CollectionBucketKey,
    {
        label: string
        short: string
        rowBorder: string
        chip: string
        icon: typeof HiOutlineCash
    }
> = {
    cash: {
        label: 'Cash',
        short: 'Cash',
        rowBorder: 'border-l-emerald-500/70',
        chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
        icon: HiOutlineCash,
    },
    gcash: {
        label: 'GCash',
        short: 'GCash',
        rowBorder: 'border-l-sky-500/70',
        chip: 'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
        icon: HiOutlineDeviceMobile,
    },
    bankTransfer: {
        label: 'Bank',
        short: 'Bank',
        rowBorder: 'border-l-violet-500/70',
        chip: 'bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
        icon: HiOutlineCreditCard,
    },
    cheque: {
        label: 'Cheque',
        short: 'Cheque',
        rowBorder: 'border-l-amber-500/70',
        chip: 'bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
        icon: HiOutlineDocumentText,
    },
    others: {
        label: 'Others',
        short: 'Other',
        rowBorder: 'border-l-gray-400/60',
        chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
        icon: HiOutlineDotsCircleHorizontal,
    },
}

export function primaryCollectionBucket(
    row: MonthlyCollectionRow,
): CollectionBucketKey | null {
    const pairs: Array<[CollectionBucketKey, number]> = [
        ['cash', row.cash],
        ['gcash', row.gcash],
        ['bankTransfer', row.bankTransfer],
        ['cheque', row.cheque],
        ['others', row.others],
    ]
    let best: CollectionBucketKey | null = null
    let max = 0
    for (const [key, amount] of pairs) {
        if (amount > max) {
            max = amount
            best = key
        }
    }
    return max > 0 ? best : null
}

export function mcCollectionRowClassName(
    row: MonthlyCollectionRow,
    index: number,
): string {
    const bucket = primaryCollectionBucket(row)
    const accent = bucket ? BUCKET_VISUAL[bucket].rowBorder : 'border-l-transparent'
    return [
        sdTableRowClassName(row, index),
        'border-l-[3px]',
        accent,
        'odd:bg-white even:bg-gray-50/40 dark:odd:bg-gray-900 dark:even:bg-gray-800/25',
    ].join(' ')
}

export function McCollectionDateCell({ value }: { value: string }) {
    const label = new Date(value).toLocaleDateString('en-PH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Manila',
    })
    const weekday = new Date(value).toLocaleDateString('en-PH', {
        weekday: 'short',
        timeZone: 'Asia/Manila',
    })
    return (
        <div className="flex min-w-0 items-center gap-2.5 py-0.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${wmIconPopClass(60)}`}
            >
                <HiOutlineCalendar className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {label}
                </p>
                <p className="truncate text-[11px] text-gray-500">{weekday}</p>
            </div>
        </div>
    )
}

export function McArReferenceCell({ row }: { row: MonthlyCollectionRow }) {
    const Icon = HiOutlineClipboardList
    return (
        <div className="flex min-w-0 items-start gap-2.5 py-0.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${wmIconPopClass(75)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-primary">
                    {row.arNumber}
                </p>
                {row.orderNumber ? (
                    <p className="truncate text-[11px] text-gray-500">
                        SO {row.orderNumber}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function McCustomerCell({ name }: { name: string }) {
    return (
        <div className="flex min-w-0 items-center gap-2.5 py-0.5">
            <CustomerAvatar name={name} size={34} />
            <div className="min-w-0">
                <p
                    className="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                    title={name}
                >
                    {name}
                </p>
                <span className="mt-0.5 hidden items-center gap-1 text-[11px] text-gray-500 sm:inline-flex">
                    <HiOutlineUser className="text-sm" aria-hidden />
                    Customer
                </span>
            </div>
        </div>
    )
}

export function McParticularCell({ value }: { value: string }) {
    if (!value?.trim()) return <Dash />
    return (
        <p
            className="line-clamp-2 max-w-[18rem] text-sm leading-snug text-gray-700 dark:text-gray-300"
            title={value}
        >
            {value}
        </p>
    )
}

export function McBucketAmountCell({
    amount,
    bucket,
    highlight,
}: {
    amount: number
    bucket: CollectionBucketKey
    highlight?: boolean
}) {
    if (amount <= 0) return <Dash />
    const visual = BUCKET_VISUAL[bucket]
    const Icon = visual.icon
    return (
        <div className="flex justify-end py-0.5">
            <span
                className={classNames(
                    'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 tabular-nums transition-transform duration-200 group-hover/row:scale-[1.02]',
                    visual.chip,
                    highlight &&
                        'border-current/20 shadow-sm ring-1 ring-current/15',
                )}
            >
                <Icon className="hidden shrink-0 text-base opacity-80 sm:inline" />
                <span className="text-xs font-semibold sm:text-sm">
                    {formatSdMoney(amount)}
                </span>
            </span>
        </div>
    )
}

export function McTotalCell({
    row,
    monthTotal,
}: {
    row: MonthlyCollectionRow
    monthTotal: number
}) {
    const bucket = primaryCollectionBucket(row)
    const share =
        monthTotal > 0 ? sharePercent(row.total, monthTotal) : 0
    return (
        <div className="flex flex-col items-end gap-1 py-0.5">
            <SdMoneyCell amount={row.total} emphasize />
            {bucket && share > 0 ? (
                <Tag
                    className={classNames(
                        'border-0 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
                        BUCKET_VISUAL[bucket].chip,
                    )}
                >
                    {BUCKET_VISUAL[bucket].short} · {share}%
                </Tag>
            ) : null}
        </div>
    )
}

export function MonthlyCollectionTenderLegend() {
    const keys = Object.keys(BUCKET_VISUAL) as CollectionBucketKey[]
    return (
        <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50/90 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/50 sm:px-4">
            {keys.map((key) => {
                const v = BUCKET_VISUAL[key]
                const Icon = v.icon
                return (
                    <span
                        key={key}
                        className={classNames(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                            v.chip,
                        )}
                    >
                        <Icon className="text-sm opacity-90" />
                        {v.label}
                    </span>
                )
            })}
        </div>
    )
}
