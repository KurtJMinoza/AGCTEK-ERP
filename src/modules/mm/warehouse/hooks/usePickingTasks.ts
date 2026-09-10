'use client'

import { pickingService } from '../services/pickingService'
import type { PickingQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function usePickingTasks(params: PickingQueryParams = {}) {
    return useQueryList(pickingService.list, params, 'picking tasks')
}
