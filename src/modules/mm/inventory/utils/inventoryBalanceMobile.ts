import type { ReceivingMobileConfig } from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import type { InventoryBalance } from '../services/inventoryService'
import { stockStatusBadgeTone } from './inventoryUi'

export function buildInventoryBalanceMobileConfig(options?: {
    onPress?: (row: InventoryBalance) => void
    showReserved?: boolean
    showCompany?: boolean
}): ReceivingMobileConfig<InventoryBalance> {
    const { onPress, showReserved, showCompany } = options ?? {}

    const fields: ReceivingMobileConfig<InventoryBalance>['fields'] = []

    if (showCompany) {
        fields.push({
            label: 'Company',
            value: (row) => row.company?.code ?? row.company?.name ?? '—',
        })
    }

    fields.push(
        {
            label: 'Warehouse',
            value: (row) => row.warehouse?.code ?? row.warehouseId.slice(0, 8),
        },
        {
            label: 'Bin',
            value: (row) => row.storageBin?.code ?? 'No bin',
        },
        {
            label: 'On hand',
            value: (row) => Number(row.quantity ?? 0).toLocaleString(),
        },
    )

    if (showReserved) {
        fields.push({
            label: 'Reserved',
            value: (row) => Number(row.reservedQuantity ?? 0).toLocaleString(),
        })
    }

    fields.push({
        label: 'Available',
        value: (row) => Number(row.availableQuantity ?? 0).toLocaleString(),
    })

    return {
        title: (row) => row.material?.materialName ?? row.materialId.slice(0, 8),
        subtitle: (row) => row.material?.materialCode ?? undefined,
        status: (row) => ({
            text: (row.stockStatus ?? '—').replace(/_/g, ' '),
            tone: stockStatusBadgeTone(row.stockStatus),
        }),
        onPress,
        fields,
    }
}

export type AtpBalanceRow = {
    id: string
    storageBinId: string | null
    stockStatus: string
    quantity: number
    reservedQuantity: number
    availableQuantity: number
}

export function buildAtpBalanceMobileConfig(): ReceivingMobileConfig<AtpBalanceRow> {
    return {
        title: (row) => (row.stockStatus ?? '—').replace(/_/g, ' '),
        subtitle: (row) =>
            row.storageBinId ? `Bin ${row.storageBinId.slice(0, 8)}` : 'No bin',
        status: (row) => {
            const onHand = Number(row.quantity)
            const available = Number(row.availableQuantity)
            const pct = onHand > 0 ? Math.round((available / onHand) * 100) : 0
            return {
                text: `${pct}% ATP`,
                tone:
                    pct >= 90 ? 'success' : pct >= 50 ? 'info' : ('warning' as const),
            }
        },
        fields: [
            {
                label: 'On hand',
                value: (row) => Number(row.quantity).toLocaleString(),
            },
            {
                label: 'Reserved',
                value: (row) => Number(row.reservedQuantity).toLocaleString(),
            },
            {
                label: 'Available',
                value: (row) => Number(row.availableQuantity).toLocaleString(),
            },
        ],
    }
}
