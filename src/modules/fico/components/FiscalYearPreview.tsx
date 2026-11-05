'use client'

import Skeleton from '@/components/ui/Skeleton'
import {
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineTag,
    HiOutlineViewGrid,
} from 'react-icons/hi'
import type { ReactNode } from 'react'
import type { FicoFiscalYearPreview } from '../types'

type PreviewPeriod = FicoFiscalYearPreview['periods'][number]

const DAY_MS = 86_400_000

const shortDate = (value: string) =>
    new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })

const longDate = (value: string) =>
    new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })

/** Inclusive calendar-day count of a date-only range. */
const dayCount = (start: string, end: string) =>
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY_MS) + 1

const tileEnterClass = (index: number) =>
    `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${Math.min(index, 16) * 35}ms]`

function SummaryItem({
    icon,
    label,
    value,
    hint,
}: {
    icon: ReactNode
    label: string
    value: ReactNode
    hint?: ReactNode
}) {
    return (
        <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                {icon}
            </span>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {label}
                </p>
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {value}
                </p>
                {hint ? <p className="truncate text-xs text-gray-500">{hint}</p> : null}
            </div>
        </div>
    )
}

function PeriodTile({ period, index }: { period: PreviewPeriod; index: number }) {
    const special = period.periodType === 'SPECIAL'
    const days = dayCount(period.startDate, period.endDate)
    return (
        <div
            className={`flex flex-col gap-2 rounded-xl border p-3 transition-shadow hover:shadow-sm ${tileEnterClass(index)} ${
                special
                    ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10'
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                        special
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
                            : 'bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light'
                    }`}
                >
                    P{String(period.periodNumber).padStart(2, '0')}
                </span>
                <span className="text-[11px] tabular-nums text-gray-400">
                    {special ? 'Adjustment' : `${days} days`}
                </span>
            </div>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {period.name}
                </p>
                <p className="truncate text-xs tabular-nums text-gray-500">
                    {shortDate(period.startDate)} – {shortDate(period.endDate)}
                </p>
            </div>
        </div>
    )
}

type Props = {
    preview: FicoFiscalYearPreview | null
    loading?: boolean
    /** Fewer columns for narrow dialogs. */
    compact?: boolean
}

const FiscalYearPreview = ({ preview, loading, compact }: Props) => {
    const gridClass = compact
        ? 'grid grid-cols-2 gap-2 sm:grid-cols-3'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton height={76} className="rounded-xl" />
                <div className={gridClass}>
                    {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} height={84} className="rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }

    if (!preview || !preview.periods.length) {
        return (
            <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                No periods to preview. Choose a fiscal year and a valid calendar.
            </div>
        )
    }

    const regular = preview.periods.filter((period) => period.periodType === 'NORMAL')
    const special = preview.periods.filter((period) => period.periodType === 'SPECIAL')
    const totalDays = dayCount(preview.startDate, preview.endDate)

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:grid-cols-2 dark:border-gray-700 dark:bg-gray-800/40">
                <SummaryItem
                    icon={<HiOutlineCalendar />}
                    label="Fiscal year"
                    value={`FY ${preview.fiscalYear}`}
                    hint={`${longDate(preview.startDate)} – ${longDate(preview.endDate)}`}
                />
                <SummaryItem
                    icon={<HiOutlineClock />}
                    label="Duration"
                    value={`${totalDays} days`}
                    hint={totalDays === 366 ? 'Includes February 29' : undefined}
                />
                <SummaryItem
                    icon={<HiOutlineViewGrid />}
                    label="Periods"
                    value={`${regular.length} regular${special.length ? ` + ${special.length} special` : ''}`}
                    hint={preview.periodType.replace(/_/g, ' ').toLowerCase()}
                />
                <SummaryItem
                    icon={<HiOutlineTag />}
                    label="Year label"
                    value={preview.yearAssignment === 'YEAR_END' ? 'End year' : 'Start year'}
                    hint={
                        preview.yearAssignment === 'YEAR_END'
                            ? 'Named after the year it ends in'
                            : 'Named after the year it starts in'
                    }
                />
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Regular periods
                </p>
                <div className={gridClass}>
                    {regular.map((period, index) => (
                        <PeriodTile key={period.periodNumber} period={period} index={index} />
                    ))}
                </div>
            </div>

            {special.length ? (
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        Year-end special periods
                    </p>
                    <div className={gridClass}>
                        {special.map((period, index) => (
                            <PeriodTile
                                key={period.periodNumber}
                                period={period}
                                index={regular.length + index}
                            />
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Special periods share the last period&apos;s dates and are only used for
                        explicit year-end adjustments, never picked from a posting date.
                    </p>
                </div>
            ) : null}
        </div>
    )
}

export default FiscalYearPreview
