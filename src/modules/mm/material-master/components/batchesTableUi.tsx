'use client'

import { HiOutlineClipboardList, HiOutlineTag } from 'react-icons/hi'
import type { RcvBadgeTone } from '@/modules/mm/receiving/components/receivingTableUi'
import { rcvIconPopClass } from '@/modules/mm/receiving/components/receivingTableUi'

export const MM_BATCH_STATUS_TONE: Record<string, RcvBadgeTone> = {
    AVAILABLE: 'success',
    QUARANTINE: 'warning',
    EXPIRED: 'danger',
    CLOSED: 'default',
}

export function BatchTrackingCodeCell({
    value,
    variant,
}: {
    value?: string | null
    variant: 'batch' | 'lot'
}) {
    if (!value?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const Icon = variant === 'batch' ? HiOutlineClipboardList : HiOutlineTag
    const iconShell =
        variant === 'batch'
            ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200'
            : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconShell} ${rcvIconPopClass(variant === 'batch' ? 40 : 55)}`}
            >
                <Icon className="text-sm" />
            </span>
            <p className="truncate font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                {value}
            </p>
        </div>
    )
}