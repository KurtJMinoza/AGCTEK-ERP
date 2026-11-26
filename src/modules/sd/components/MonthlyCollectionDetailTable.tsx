'use client'

import { useMemo } from 'react'
import classNames from '@/utils/classNames'
import SdDataTable from './SdDataTable'
import type {
    MonthlyCollectionMonth,
    MonthlyCollectionRow,
} from '../services/monthlyCollectionService'
import { buildMonthlyCollectionDetailColumns } from './monthlyCollectionDetailColumns'
import {
    mcCollectionRowClassName,
    MonthlyCollectionTenderLegend,
} from './MonthlyCollectionTableCells'

type Props = {
    month: MonthlyCollectionMonth
    monthLabel: string
    year: number
    loading?: boolean
    className?: string
}

export default function MonthlyCollectionDetailTable({
    month,
    monthLabel,
    year,
    loading,
    className,
}: Props) {
    const rows = month.rows ?? []
    const columns = useMemo(
        () => buildMonthlyCollectionDetailColumns(month),
        [month],
    )

    return (
        <div
            className={classNames(
                'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:ring-gray-800',
                className,
            )}
        >
            <div className="flex flex-col gap-1 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="min-w-0">
                    <p className="text-sm font-semibold heading-text">
                        {monthLabel} {year}
                    </p>
                    <p className="text-xs text-gray-500">
                        Scroll horizontally on small screens to view all tender
                        columns
                    </p>
                </div>
            </div>
            <MonthlyCollectionTenderLegend />
            <SdDataTable<MonthlyCollectionRow>
                columns={columns}
                data={rows}
                loading={loading}
                wide
                hidePagination={rows.length <= 25}
                pageSizes={[25, 50, 100]}
                tableMinWidthClass="min-w-[1180px]"
                getRowId={(row) =>
                    `${row.collectionDate}-${row.arNumber}-${row.orderNumber}-${row.total}`
                }
                rowClassName={(row, index) =>
                    mcCollectionRowClassName(row, index)
                }
                className="[&_.table-default]:border-0 [&_.table-default_thead]:bg-gray-50/95 [&_.table-default_thead]:dark:bg-gray-800/80"
            />
        </div>
    )
}