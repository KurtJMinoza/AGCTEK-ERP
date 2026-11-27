'use client'

import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import FilterBar from '@/components/shared/FilterBar'
import type { FilterChip, FilterField } from '@/components/shared/FilterBar'
import { HiOutlineFilter } from 'react-icons/hi'
import SalesAnalyticsPeriodFilters from './SalesAnalyticsPeriodFilters'

type PanelProps = {
    isOpen: boolean
    onClose: () => void
    filterFields: FilterField[]
    filterChips: FilterChip[]
    onClearFilters: () => void
    customFrom: Date | null
    customTo: Date | null
    onCustomFromChange: (value: Date | null) => void
    onCustomToChange: (value: Date | null) => void
    onApplyCustomPeriod: () => void
    loading?: boolean
    /** When set, period apply also closes the panel (complete report modal). */
    closeOnPeriodApply?: boolean
}

export const SalesLineReportFiltersPanel = ({
    isOpen,
    onClose,
    filterFields,
    filterChips,
    onClearFilters,
    customFrom,
    customTo,
    onCustomFromChange,
    onCustomToChange,
    onApplyCustomPeriod,
    loading = false,
    closeOnPeriodApply = false,
}: PanelProps) => {
    const handleApplyPeriod = () => {
        onApplyCustomPeriod()
        if (closeOnPeriodApply) onClose()
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={480}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1 text-lg font-bold heading-text">
                Report filters
            </h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Custom date range and line filters. Table updates as you change
                sales filters; apply dates to reload from the server.
            </p>
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date range
                </p>
                <SalesAnalyticsPeriodFilters
                    compact
                    datesOnly
                    applyLabel="Apply & reload"
                    customFrom={customFrom}
                    customTo={customTo}
                    onCustomFromChange={onCustomFromChange}
                    onCustomToChange={onCustomToChange}
                    onApplyCustom={handleApplyPeriod}
                    loading={loading}
                />
            </div>
            <FilterBar
                fields={filterFields}
                chips={filterChips}
                onClear={onClearFilters}
            />
            <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" onClick={onClose}>
                    Done
                </Button>
            </div>
        </Dialog>
    )
}

type TriggerProps = {
    activeCount: number
    onClick: () => void
    size?: 'sm' | 'md'
}

export const SalesLineReportFilterTrigger = ({
    activeCount,
    onClick,
    size = 'sm',
}: TriggerProps) => (
    <Button
        size={size}
        variant={activeCount > 0 ? 'solid' : 'default'}
        icon={<HiOutlineFilter />}
        onClick={onClick}
    >
        Filters
        {activeCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-px text-xs tabular-nums">
                {activeCount}
            </span>
        ) : null}
    </Button>
)
