'use client'

import type { RcvBadgeTone } from '@/modules/mm/receiving/components/receivingTableUi'
import type { MaterialStatus } from '../types'

export function mmTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export const MM_MATERIAL_STATUS_TONE: Record<MaterialStatus, RcvBadgeTone> = {
    ACTIVE: 'success',
    DRAFT: 'default',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}
