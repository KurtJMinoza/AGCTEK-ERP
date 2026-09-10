import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { WmInventoryBalance } from '../types'

const BASE = '/mm/inventory-balance'

export const inventoryBalanceService = {
    list: (params?: {
        binId?: string
        materialId?: string
        warehouseId?: string
    }) =>
        ErpAxiosBase.get<WmInventoryBalance[]>(BASE, { params }).then(
            (r) => r.data,
        ),
}
