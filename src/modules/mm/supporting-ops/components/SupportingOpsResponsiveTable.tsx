'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { sopTableRowEnterClass } from './supportingOpsTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type SupportingOpsMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function SupportingOpsResponsiveTable<T>(props: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...props}
            rowEnterClass={sopTableRowEnterClass}
        />
    )
}
