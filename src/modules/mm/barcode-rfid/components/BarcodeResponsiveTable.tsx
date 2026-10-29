'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { bcTableRowEnterClass } from './barcodeTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type BarcodeMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function BarcodeResponsiveTable<T>(props: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...props}
            rowEnterClass={bcTableRowEnterClass}
        />
    )
}
