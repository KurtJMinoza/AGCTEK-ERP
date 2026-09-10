'use client'

import { warehouseService } from '../services/warehouseService'
import type { WarehouseQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useWarehouses(params: WarehouseQueryParams = {}) {
    return useQueryList(warehouseService.list, params, 'warehouses')
}
