'use client'

import { materialService } from '../services/materialService'
import type { MaterialQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useMaterials(params: MaterialQueryParams = {}) {
    return useQueryList(materialService.list, params, 'materials')
}
