import type { ReceivingMobileConfig } from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import { fmtRcvDate } from '@/modules/mm/receiving/components/receivingTableUi'
import { DOC_STATUS_TONE } from './inventoryUi'
import type { StockDocLike } from './stockDocColumns'
import type { ReactNode } from 'react'

export function buildStockDocMobileConfig<
    T extends StockDocLike & {
        stockStatus?: string
        warehouse?: { name?: string }
        lines?: unknown[]
    },
>(options: {
    onPress: (row: T) => void
    detailLabel: string
    detailValue: (row: T) => string
    detailSub?: (row: T) => string | undefined
    warehouse?: (row: T) => string | undefined
    extraFields?: { label: string; value: (row: T) => ReactNode }[]
}): ReceivingMobileConfig<T> {
    const { onPress, detailLabel, detailValue, detailSub, warehouse, extraFields } =
        options

    const fields: ReceivingMobileConfig<T>['fields'] = [
        {
            label: detailLabel,
            value: (row) => detailValue(row) || '—',
        },
    ]

    if (detailSub) {
        fields.push({
            label: 'Reference',
            value: (row) => detailSub(row) || '—',
        })
    }

    if (warehouse) {
        fields.push({
            label: 'Warehouse',
            value: (row) => warehouse(row) || '—',
        })
    }

    if (extraFields?.length) {
        fields.push(...extraFields)
    }

    return {
        title: (row) => row.documentNumber,
        subtitle: (row) => fmtRcvDate(row.postingDate),
        status: (row) => ({
            text: row.status.replace(/_/g, ' '),
            tone: DOC_STATUS_TONE[row.status] ?? 'default',
        }),
        onPress,
        fields,
    }
}
