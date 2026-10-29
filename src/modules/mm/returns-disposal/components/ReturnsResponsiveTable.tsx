'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { rdTableRowEnterClass } from './returnsTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type ReturnsMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function ReturnsResponsiveTable<T>(props: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...props}
            rowEnterClass={rdTableRowEnterClass}
        />
    )
}
