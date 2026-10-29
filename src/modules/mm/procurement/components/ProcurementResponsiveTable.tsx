'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { prcTableRowEnterClass } from './procurementTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type ProcurementMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function ProcurementResponsiveTable<T>(props: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...props}
            rowEnterClass={prcTableRowEnterClass}
        />
    )
}
