'use client'

import { putawayService } from '../services/putawayService'
import type { PutawayQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function usePutawayTasks(params: PutawayQueryParams = {}) {
    return useQueryList(putawayService.list, params, 'putaway tasks')
}
