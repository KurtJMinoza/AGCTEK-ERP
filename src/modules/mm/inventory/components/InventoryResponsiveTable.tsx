'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { invTableRowEnterClass } from './inventoryTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type InventoryMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function InventoryResponsiveTable<T>({
    rowEnterClass = invTableRowEnterClass,
    ...rest
}: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...rest}
            rowEnterClass={rowEnterClass}
        />
    )
}
