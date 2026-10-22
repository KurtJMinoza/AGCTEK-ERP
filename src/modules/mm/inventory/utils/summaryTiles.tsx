'use client'

import StatCard from '@/components/shared/StatCard'
import {
    HiOutlineClipboardList,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineXCircle,
    HiOutlineReply,
    HiOutlineInbox,
    HiOutlineArrowUp,
} from 'react-icons/hi'
import { DOC_STATUS_TONE, docStatusLabel } from './inventoryUi'

/**
 * Summary tiles for the document lists (Goods Issue, Goods Receipt,
 * Adjustments, Transfers, Reservations).
 *
 * The numbers come from the server-side status aggregate, never from the rows
 * currently on screen, so the tiles always describe the whole filter.
 */

export type StatusSummary = { status: string; count: number }[]

const ICONS: Record<string, typeof HiOutlineCheckCircle> = {
    DRAFT: HiOutlineClock,
    PENDING_APPROVAL: HiOutlineClock,
    POSTED: HiOutlineCheckCircle,
    COMPLETED: HiOutlineCheckCircle,
    FULFILLED: HiOutlineCheckCircle,
    APPROVED: HiOutlineCheckCircle,
    CANCELLED: HiOutlineXCircle,
    REJECTED: HiOutlineXCircle,
    REVERSED: HiOutlineReply,
    OPEN: HiOutlineInbox,
    PARTIAL: HiOutlineArrowUp,
}

/** Map a StatusBadge tone onto a StatCard tone. */
const CARD_TONE: Record<string, 'default' | 'success' | 'info' | 'warning' | 'danger'> = {
    default: 'default',
    success: 'success',
    info: 'info',
    warning: 'warning',
    danger: 'danger',
}

export const StatusSummaryTiles = ({
    byStatus,
    total,
    totalLabel = 'Documents in scope',
}: {
    byStatus: StatusSummary | undefined
    total: number
    totalLabel?: string
}) => {
    const rows = (byStatus ?? []).filter((r) => r.count > 0)

    return (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
                label={totalLabel}
                value={total.toLocaleString()}
                tone="info"
                icon={<HiOutlineClipboardList />}
            />
            {rows.map((row) => {
                const Icon = ICONS[row.status] ?? HiOutlineClipboardList
                return (
                    <StatCard
                        key={row.status}
                        label={docStatusLabel(row.status)}
                        value={row.count.toLocaleString()}
                        tone={CARD_TONE[DOC_STATUS_TONE[row.status] ?? 'default']}
                        icon={<Icon />}
                    />
                )
            })}
        </div>
    )
}
