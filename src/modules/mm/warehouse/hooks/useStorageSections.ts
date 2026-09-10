'use client'

import { storageSectionService } from '../services/storageSectionService'
import type { StorageSectionQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useStorageSections(params: StorageSectionQueryParams = {}) {
    return useQueryList(storageSectionService.list, params, 'storage sections')
}
