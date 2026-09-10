'use client'

import { transferService } from '../services/transferService'
import type { TransferQueryParams } from '../types'
import { useQueryList } from '@/modules/mm/shared/useQueryList'

export function useTransfers(params: TransferQueryParams = {}) {
    return useQueryList(transferService.list, params, 'warehouse transfers')
}
