'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { icTableRowEnterClass } from './inventoryControlTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type InventoryControlMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function InventoryControlResponsiveTable<T>(props: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...props}
            rowEnterClass={icTableRowEnterClass}
        />
    )
}
