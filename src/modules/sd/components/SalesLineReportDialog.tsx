'use client'

import { useMemo, useState } from 'react'
import { HiOutlineClipboardList } from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import DataTable from '@/components/shared/DataTable'
import useWindowSize from '@/components/ui/hooks/useWindowSize'
import type { ColumnDef } from '@/components/shared/DataTable'
import type { FilterChip, FilterField } from '@/components/shared/FilterBar'
import { sdTableRowClassName } from './SdDataTableCells'
import { buildSalesLineReportColumns } from './salesLineReportColumns'
import {
    SalesLineReportFilterTrigger,
    SalesLineReportFiltersPanel,
} from './SalesLineReportFiltersPanel'
import type { SalesLineReportRow } from '../services/salesAnalyticsService'

type Props = {
    isOpen: boolean
    onClose: () => void
    rows: SalesLineReportRow[]
    currency: string
    periodLabel?: string
    productByName: Map<string, { productName: string; sku: string | null }>
    onParticularClick?: (particular: string) => void
    filterFields: FilterField[]
    filterChips: FilterChip[]
    onClearFilters: () => void
    activeFilterCount: number
    totalLines: number
    customFrom: Date | null
    customTo: Date | null
    onCustomFromChange: (value: Date | null) => void
    onCustomToChange: (value: Date | null) => void
    onApplyCustomPeriod: () => void
    loading?: boolean
}

const TABLE_SCROLL_CLASS =
    '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-gray-50 [&_thead_th]:shadow-sm dark:[&_thead_th]:bg-gray-900'

const SalesLineReportDialog = ({
    isOpen,
    onClose,
    rows,
    currency,
    periodLabel,
    productByName,
    onParticularClick,
    filterFields,
    filterChips,
    onClearFilters,
    activeFilterCount,
    totalLines,
    customFrom,
    customTo,
    onCustomFromChange,
    onCustomToChange,
    onApplyCustomPeriod,
    loading = false,
}: Props) => {
    const [filtersOpen, setFiltersOpen] = useState(false)
    const viewport = useWindowSize()
    const dialogWidth = useMemo(() => {
        const w = viewport.width
        if (typeof w !== 'number' || w <= 0) return 1680
        return Math.min(1680, Math.max(320, w - 16))
    }, [viewport.width])

    const columns = useMemo(
        () =>
            buildSalesLineReportColumns({
                variant: 'full',
                currency,
                productByName,
                onParticularClick,
            }),
        [currency, productByName, onParticularClick],
    )

    return (
        <>
            <Dialog
                isOpen={isOpen}
                width={dialogWidth}
                contentClassName="flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-hidden p-0"
                aria={{ labelledby: 'sales-line-report-title' }}
                onClose={onClose}
                onRequestClose={onClose}
            >
                <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-lg text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                            <HiOutlineClipboardList />
                        </span>
                        <div className="min-w-0">
                            <h4
                                id="sales-line-report-title"
                                className="truncate text-base font-bold heading-text sm:text-lg"
                            >
                                Complete sales line report
                            </h4>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                <Tag className="font-semibold">
                                    {rows.length.toLocaleString('en-PH')} shown
                                    {rows.length !== totalLines
                                        ? ` · ${totalLines.toLocaleString('en-PH')} total`
                                        : ''}
                                </Tag>
                                {periodLabel ? (
                                    <span className="truncate">
                                        {periodLabel}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <SalesLineReportFilterTrigger
                        activeCount={activeFilterCount}
                        onClick={() => setFiltersOpen(true)}
                    />
                </header>

                <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 sm:px-4 sm:pb-3">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-inner dark:border-gray-700 dark:bg-gray-900/20">
                        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain">
                            <DataTable
                                compact
                                hoverable
                                className={`min-w-max text-xs ${TABLE_SCROLL_CLASS}`}
                                columns={columns as ColumnDef<unknown>[]}
                                data={rows}
                                noData={!rows.length}
                                hidePagination
                                rowClassName={sdTableRowClassName}
                            />
                        </div>
                    </div>
                </div>

                <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-2.5 dark:border-gray-700 sm:px-5">
                    <Button size="sm" variant="solid" onClick={onClose}>
                        Close
                    </Button>
                </footer>
            </Dialog>

            <SalesLineReportFiltersPanel
                isOpen={filtersOpen}
                customFrom={customFrom}
                customTo={customTo}
                filterFields={filterFields}
                filterChips={filterChips}
                loading={loading}
                closeOnPeriodApply
                onClose={() => setFiltersOpen(false)}
                onClearFilters={onClearFilters}
                onCustomFromChange={onCustomFromChange}
                onCustomToChange={onCustomToChange}
                onApplyCustomPeriod={onApplyCustomPeriod}
            />
        </>
    )
}

export default SalesLineReportDialog
