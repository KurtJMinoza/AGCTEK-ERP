'use client'

import ReceivingResponsiveTable, {
    type ReceivingMobileConfig,
} from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { ficoMobileCardEnterClass, ficoTableRowEnterClass } from './ficoTableUi'
import type { ComponentProps } from 'react'

export type { ColumnDef } from '@/components/shared/DataTable'
export type FicoMobileConfig<T> = ReceivingMobileConfig<T>

type Props<T> = ComponentProps<typeof ReceivingResponsiveTable<T>>

/** Finance list table: horizontal scroll on desktop, cards on mobile, animated rows. */
export default function FicoResponsiveTable<T>({
    rowEnterClass = ficoTableRowEnterClass,
    mobileCardEnterClass = ficoMobileCardEnterClass,
    ...rest
}: Props<T> & { mobileCardEnterClass?: (index: number) => string }) {
    return (
        <ReceivingResponsiveTable<T>
            {...rest}
            rowEnterClass={rowEnterClass}
            mobileCardEnterClass={mobileCardEnterClass}
        />
    )
}
