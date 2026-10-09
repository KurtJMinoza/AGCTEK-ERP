'use client'

import { storageShelfService } from '../services/storageShelfService'
import type { StorageShelfQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useStorageShelves(params: StorageShelfQueryParams = {}) {
    return useQueryList(storageShelfService.list, params, 'storage shelves')
}
