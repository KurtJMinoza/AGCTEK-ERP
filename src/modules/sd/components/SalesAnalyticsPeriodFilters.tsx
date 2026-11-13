'use client'

import dayjs from 'dayjs'
import DatePicker from '@/components/ui/DatePicker'
import Button from '@/components/ui/Button'
import Segment from '@/components/ui/Segment'
import type { SalesAnalyticsRange } from '../services/salesAnalyticsService'

const RANGE_OPTIONS: { value: SalesAnalyticsRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7days', label: 'Last 7 days' },
    { value: 'month', label: 'This month' },
    { value: 'ytd', label: 'Year to date' },
    { value: 'custom', label: 'Custom' },
]

export const toYmd = (value: Date | null) =>
    value ? dayjs(value).format('YYYY-MM-DD') : ''

type Props = {
    dateRange?: SalesAnalyticsRange
    onDateRangeChange?: (range: SalesAnalyticsRange) => void
    customFrom: Date | null
    customTo: Date | null
    onCustomFromChange: (value: Date | null) => void
    onCustomToChange: (value: Date | null) => void
    onApplyCustom?: () => void
    loading?: boolean
    compact?: boolean
    applyLabel?: string
    /** Hide preset segment; show From/To pickers only (e.g. line report modal). */
    datesOnly?: boolean
}

const SalesAnalyticsPeriodFilters = ({
    dateRange,
    onDateRangeChange,
    customFrom,
    customTo,
    onCustomFromChange,
    onCustomToChange,
    onApplyCustom,
    loading = false,
    compact = false,
    applyLabel = 'Apply dates',
    datesOnly = false,
}: Props) => {
    const showCustomDates = datesOnly || dateRange === 'custom'

    return (
        <div
            className={
                compact
                    ? 'flex flex-col gap-3'
                    : 'flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end'
            }
        >
            {!datesOnly && dateRange != null && onDateRangeChange ? (
                <Segment
                    size="sm"
                    value={dateRange}
                    onChange={(value) =>
                        onDateRangeChange(value as SalesAnalyticsRange)
                    }
                >
                    {RANGE_OPTIONS.map((option) => (
                        <Segment.Item key={option.value} value={option.value}>
                            {option.label}
                        </Segment.Item>
                    ))}
                </Segment>
            ) : null}
            {showCustomDates ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="min-w-[10rem]">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                            From
                        </span>
                        <DatePicker
                            size="sm"
                            inputtable
                            placeholder="Start date"
                            value={customFrom}
                            maxDate={customTo ?? undefined}
                            onChange={onCustomFromChange}
                        />
                    </div>
                    <div className="min-w-[10rem]">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                            To
                        </span>
                        <DatePicker
                            size="sm"
                            inputtable
                            placeholder="End date"
                            value={customTo}
                            minDate={customFrom ?? undefined}
                            onChange={onCustomToChange}
                        />
                    </div>
                    {onApplyCustom ? (
                        <Button
                            size="sm"
                            variant="solid"
                            loading={loading}
                            disabled={!customFrom || !customTo}
                            onClick={onApplyCustom}
                        >
                            {applyLabel}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export default SalesAnalyticsPeriodFilters
