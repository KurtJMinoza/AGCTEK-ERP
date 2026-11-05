'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { ficoTableRowEnterClass } from './ficoTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type FicoMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

/** Finance list table: horizontal scroll on desktop, cards on mobile, animated rows. */
export default function FicoResponsiveTable<T>({
    rowEnterClass = ficoTableRowEnterClass,
    ...rest
}: Props<T>) {
    return <ReceivingResponsiveTable<T> {...rest} rowEnterClass={rowEnterClass} />
}
