'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { raTableRowEnterClass } from './reportsTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type ReportsMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

export default function ReportsResponsiveTable<T>({
    rowEnterClass = raTableRowEnterClass,
    ...rest
}: Props<T>) {
    return (
        <ReceivingResponsiveTable<T>
            {...rest}
            rowEnterClass={rowEnterClass}
        />
    )
}
