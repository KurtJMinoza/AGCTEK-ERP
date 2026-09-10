'use client'

import { packingService } from '../services/packingService'
import type { PackageQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function usePackages(params: PackageQueryParams = {}) {
    return useQueryList(packingService.list, params, 'packages')
}
