'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import type { FicoBadgeTone } from '../ficoTableUi'
import type { FicoArAgingBucket } from '../../types'

const OPEN_ITEM_STATUS_TONE: Record<string, FicoBadgeTone> = {
    OPEN: 'warning',
    PARTIALLY_CLEARED: 'info',
    CLEARED: 'success',
    REVERSED: 'default',
}

const AGING_BUCKET_TONE: Record<FicoArAgingBucket, FicoBadgeTone> = {
    CURRENT: 'success',
    D1_30: 'info',
    D31_60: 'warning',
    D61_90: 'warning',
    D90_PLUS: 'danger',
}

const AGING_BUCKET_LABEL: Record<FicoArAgingBucket, string> = {
    CURRENT: 'Current',
    D1_30: '1–30 days',
    D31_60: '31–60 days',
    D61_90: '61–90 days',
    D90_PLUS: '90+ days',
}

export function ArOpenItemStatus({ status }: { status: string }) {
    return (
        <StatusBadge tone={OPEN_ITEM_STATUS_TONE[status] ?? 'default'}>
            {status.replace(/_/g, ' ')}
        </StatusBadge>
    )
}

export function ArAgingBucketBadge({ bucket }: { bucket?: FicoArAgingBucket | null }) {
    if (!bucket) return <span className="text-sm text-gray-400">—</span>
    return (
        <StatusBadge tone={AGING_BUCKET_TONE[bucket]}>
            {AGING_BUCKET_LABEL[bucket]}
        </StatusBadge>
    )
}

export function formatArMoney(currency: string, amount: string | number | null | undefined) {
    const n = Number(amount ?? 0)
    if (Number.isNaN(n)) return `${currency} ${amount ?? '—'}`
    return `${currency} ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

export function formatArDate(value?: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString()
}

export function arBucketAmount(
    buckets: Record<string, string | { toString(): string }> | undefined,
    key: FicoArAgingBucket,
): string {
    const raw = buckets?.[key]
    if (raw == null) return '0'
    return typeof raw === 'string' ? raw : raw.toString()
}

export const AR_AGING_BUCKET_ORDER: FicoArAgingBucket[] = [
    'CURRENT',
    'D1_30',
    'D31_60',
    'D61_90',
    'D90_PLUS',
]

export { AGING_BUCKET_LABEL }
