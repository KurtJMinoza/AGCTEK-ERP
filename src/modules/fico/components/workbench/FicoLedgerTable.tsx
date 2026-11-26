'use client'

import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'
import FicoResponsiveTable, { type ColumnDef } from '../FicoResponsiveTable'
import { FicoTableToolbar } from './FicoWorkbenchChrome'

type FicoLedgerTableProps<T> = {
    title?: string
    description?: string
    toolbar?: ReactNode
    columns: ColumnDef<T>[]
    data: T[]
    loading?: boolean
    noData?: boolean
    hidePagination?: boolean
    tableMinWidthClass?: string
    className?: string
}

/** Bordered finance subledger table — shared header chrome and responsive grid. */
export default function FicoLedgerTable<T>({
    title,
    description,
    toolbar,
    columns,
    data,
    loading,
    noData,
    hidePagination,
    tableMinWidthClass = 'min-w-[960px]',
    className,
}: FicoLedgerTableProps<T>) {
    return (
        <div
            className={classNames(
                'overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/30',
                className,
            )}
        >
            {title || description || toolbar ? (
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/80 sm:px-5">
                    <FicoTableToolbar title={title} description={description}>
                        {toolbar}
                    </FicoTableToolbar>
                </div>
            ) : null}
            <div
                className={classNames(
                    'fico-ledger-table [&_table]:text-sm',
                    '[&_thead_th]:bg-gray-50/95 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:text-gray-500',
                    'dark:[&_thead_th]:bg-gray-900/60 dark:[&_thead_th]:text-gray-400',
                    '[&_tbody_tr]:border-gray-100 dark:[&_tbody_tr]:border-gray-800/80',
                )}
            >
                <FicoResponsiveTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    noData={noData}
                    hidePagination={hidePagination}
                    stickyPageSize
                    tableMinWidthClass={tableMinWidthClass}
                    pageSizes={[10, 25, 50]}
                />
            </div>
        </div>
    )
}