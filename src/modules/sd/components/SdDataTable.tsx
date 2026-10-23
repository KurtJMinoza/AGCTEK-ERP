'use client'

import type { ComponentProps } from 'react'
import DataTable from '@/components/shared/DataTable'
import {
    SD_DATA_TABLE_LAYOUT,
    sdTableRowClassName,
} from './SdDataTableCells'

export type SdDataTableProps<T> = ComponentProps<typeof DataTable> & {
    columns: ComponentProps<typeof DataTable>['columns']
    data?: T[]
}

/**
 * SD module DataTable with responsive scroll shell, compact layout, and row entrance animation.
 */
function SdDataTable<T>({ rowClassName, ...props }: SdDataTableProps<T>) {
    return (
        <div className="min-w-0 overflow-x-auto">
            <DataTable
                {...SD_DATA_TABLE_LAYOUT}
                rowClassName={(row, index) =>
                    [sdTableRowClassName(row, index), rowClassName?.(row, index)]
                        .filter(Boolean)
                        .join(' ')
                }
                {...props}
            />
        </div>
    )
}

export default SdDataTable
