'use client'

import { storageTypeService } from '../services/storageTypeService'
import type { StorageTypeQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useStorageTypes(params: StorageTypeQueryParams = {}) {
    return useQueryList(storageTypeService.list, params, 'storage types')
}
