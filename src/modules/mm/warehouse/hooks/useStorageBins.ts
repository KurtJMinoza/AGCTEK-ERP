'use client'

import { storageBinService } from '../services/storageBinService'
import type { StorageBinQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useStorageBins(params: StorageBinQueryParams = {}) {
    return useQueryList(storageBinService.list, params, 'storage bins')
}
