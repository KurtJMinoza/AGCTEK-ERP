'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { wmTableRowEnterClass } from './WarehouseTableCells'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type WarehouseMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function WarehouseResponsiveTable<T>({
    rowEnterClass = wmTableRowEnterClass,
    ...rest
}: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...rest}
            rowEnterClass={rowEnterClass}
        />
    )
}
