'use client'

import { pickWaveService } from '../services/pickWaveService'
import type { PickingQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function usePickWaves(params: PickingQueryParams = {}) {
    return useQueryList(pickWaveService.list, params, 'pick waves')
}
