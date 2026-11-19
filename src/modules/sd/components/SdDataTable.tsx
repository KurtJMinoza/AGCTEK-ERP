'use client'

import classNames from 'classnames'
import type { ComponentProps } from 'react'
import DataTable from '@/components/shared/DataTable'
import {
    SD_DATA_TABLE_LAYOUT,
    sdTableRowClassName,
} from './SdDataTableCells'

export type SdDataTableProps<T> = ComponentProps<typeof DataTable<T>> & {
    /** Inner min-width so wide column sets scroll horizontally instead of squeezing. */
    tableMinWidthClass?: string
    /**
     * Many-column register: disable fit-to-width squeeze; table grows with column sizes
     * and scrolls inside the shell (External Platform Sales, full line report, etc.).
     */
    wide?: boolean
}

/**
 * SD module DataTable with responsive scroll shell, compact layout, and row entrance animation.
 */
function SdDataTable<T>({
    rowClassName,
    tableMinWidthClass,
    wide,
    fit,
    className,
    ...props
}: SdDataTableProps<T>) {
    const resolvedFit = wide ? false : (fit ?? SD_DATA_TABLE_LAYOUT.fit)
    const table = (
        <DataTable<T>
            {...SD_DATA_TABLE_LAYOUT}
            fit={resolvedFit}
            className={classNames(wide && 'w-max max-w-none', className)}
            rowClassName={(row, index) =>
                [sdTableRowClassName(row, index), rowClassName?.(row, index)]
                    .filter(Boolean)
                    .join(' ')
            }
            {...props}
        />
    )
    return (
        <div className="min-w-0 overflow-x-auto overscroll-x-contain">
            {tableMinWidthClass ? (
                <div className={tableMinWidthClass}>{table}</div>
            ) : (
                table
            )}
        </div>
    )
}

export default SdDataTable
