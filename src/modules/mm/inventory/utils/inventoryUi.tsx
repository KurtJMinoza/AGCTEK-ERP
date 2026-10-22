'use client'

import type { ReactNode } from 'react'
import Tag from '@/components/ui/Tag'
import StatusBadge from '@/components/shared/StatusBadge'
import { HiOutlineShieldCheck, HiOutlineUser } from 'react-icons/hi'
import { actorLabel, movementTone, sourceLabel } from './ledgerLabels'

/**
 * Shared visual language for the MM Inventory module.
 *
 * Every Inventory Management page uses the same atoms so the sub-modules
 * read as one product: the same tone colours, the same status chips, the same
 * document-number typography and the same "safe to retry" marker.
 */

export type InventoryTone = 'inbound' | 'outbound' | 'neutral' | 'warning'

/** Tag colours per movement tone. */
export const TONE_CARD: Record<string, string> = {
    inbound:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    outbound:
        'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    neutral:
        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    warning:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

/** Tag colours per stock status. */
export const STOCK_STATUS_TONE: Record<string, string> = {
    UNRESTRICTED:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    RESTRICTED:
        'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    QUARANTINE:
        'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    BLOCKED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    INSPECTION:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    DAMAGED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    IN_TRANSIT:
        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
}

/** Badge tone per document status. */
export const DOC_STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger' | 'info'
> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'info',
    PICKED: 'info',
    IN_TRANSIT: 'info',
    POSTED: 'success',
    COMPLETED: 'success',
    FULFILLED: 'success',
    CANCELLED: 'danger',
    REJECTED: 'danger',
    REVERSED: 'warning',
    OPEN: 'info',
    PARTIAL: 'warning',
    EXPIRED: 'default',
}

/** Human label for a document / reservation status. */
export const docStatusLabel = (status?: string | null) => {
    if (!status) return '—'
    return status
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
}

/** Document status badge with the shared tone palette. */
export const DocStatusBadge = ({ status }: { status?: string | null }) => (
    <StatusBadge tone={DOC_STATUS_TONE[status ?? ''] ?? 'default'}>
        {docStatusLabel(status)}
    </StatusBadge>
)

/** Stock status chip (UNRESTRICTED / BLOCKED / …). */
export const StockStatusTag = ({ status }: { status?: string | null }) => (
    <Tag className={STOCK_STATUS_TONE[status ?? ''] ?? TONE_CARD.neutral}>
        {(status ?? '—').replace(/_/g, ' ')}
    </Tag>
)

/** The little radar blip that marks where a posting came from. */
export const ReferenceDot = ({ tone }: { tone: string }) => {
    const color =
        tone === 'inbound'
            ? 'bg-emerald-500'
            : tone === 'outbound'
              ? 'bg-rose-500'
              : tone === 'warning'
                ? 'bg-amber-500'
                : 'bg-gray-400'
    return (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`}
            />
            <span
                className={`relative inline-flex h-2 w-2 rounded-full ${color}`}
            />
        </span>
    )
}

/** "Safe to retry" marker for a posting that carries an idempotency key. */
export const RetrySafeChip = ({ idempotencyKey }: { idempotencyKey?: string | null }) => {
    if (!idempotencyKey) {
        return <span className="text-sm text-gray-300">—</span>
    }
    return (
        <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            title={`Duplicate-safe key: ${idempotencyKey}`}
        >
            <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Safe to retry
        </span>
    )
}

/** Who posted a movement, in plain language. */
export const ActorCell = ({ createdBy }: { createdBy?: string | null }) => (
    <div className="min-w-[7.5rem] max-w-[8rem] whitespace-nowrap" title={createdBy ?? undefined}>
        <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <HiOutlineUser className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {actorLabel(createdBy)}
        </div>
    </div>
)

/** Movement tone helper re-exported so pages share one definition. */
export { movementTone, sourceLabel }

/** Shared wrapper for a document number (monospaced, never wrapped). */
export const DocNumber = ({
    children,
    className = '',
}: {
    children: ReactNode
    className?: string
}) => (
    <span className={`font-mono text-xs font-semibold text-gray-900 ${className}`}>
        {children}
    </span>
)
