'use client'

import Link from 'next/link'
import StatusBadge from '@/components/shared/StatusBadge'
import type { StatusTone } from '@/components/shared/StatusBadge'
import type { ReactNode } from 'react'

/** Modules whose journals must be reversed via the originating module / subledger — not the journal UI. */
export const JOURNAL_REVERSE_BLOCKED_MODULES = new Set([
    'MM',
    'RETURNS_DISPOSAL',
    'SD',
    'PP',
    'AP',
    'AR',
])

const SOURCE_TONE: Record<string, StatusTone> = {
    MM: 'warning',
    SD: 'info',
    AP: 'success',
    AR: 'success',
    PP: 'warning',
    MANUAL: 'default',
}

export type JournalSourceFields = {
    sourceModule?: string | null
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    description?: string | null
    /** SD return request id when stamped on automatic return journals. */
    returnRequestId?: string | null
}

export function normalizeSourceModule(module?: string | null): string {
    if (!module?.trim()) return 'MANUAL'
    return module.trim().toUpperCase()
}

export function canManuallyReverseJournal(input: {
    status?: string | null
    sourceModule?: string | null
}): boolean {
    if (input.status !== 'POSTED') return false
    const module = normalizeSourceModule(input.sourceModule)
    if (module === 'MANUAL') return true
    return !JOURNAL_REVERSE_BLOCKED_MODULES.has(module)
}

export function journalSourceBadgeLabel(module?: string | null): string {
    const normalized = normalizeSourceModule(module)
    if (normalized === 'MANUAL') return 'MANUAL'
    if (normalized === 'RETURNS_DISPOSAL') return 'MM'
    return normalized
}

export function journalSourceTone(module?: string | null): StatusTone {
    const normalized = normalizeSourceModule(module)
    if (normalized === 'RETURNS_DISPOSAL') return SOURCE_TONE.MM
    return SOURCE_TONE[normalized] ?? 'default'
}

function customerReturnsHref(requestId?: string | null): string {
    const id = requestId?.trim()
    if (id) {
        return `/modules/sd/customer-returns?requestId=${encodeURIComponent(id)}`
    }
    return `/modules/sd/customer-returns`
}

/** Resolve an in-app route for the originating document when we know how to deep-link. */
export function resolveJournalSourceHref(source: JournalSourceFields): string | null {
    const module = normalizeSourceModule(source.sourceModule)
    const type = (source.sourceDocumentType ?? '').toUpperCase()
    const id = source.sourceDocumentId?.trim()
    const returnRequestId = source.returnRequestId?.trim()
    if ((!id && !returnRequestId) || module === 'MANUAL') return null

    if (module === 'SD') {
        if (
            type.includes('INVOICE') ||
            type === 'SALES_INVOICE' ||
            type === 'CUSTOMER_INVOICE'
        ) {
            return id ? `/modules/sd/billing/${id}` : null
        }
        if (
            type === 'RETURN_REQUEST' ||
            type.includes('RETURN') ||
            type === 'CUSTOMER_RETURN'
        ) {
            return customerReturnsHref(returnRequestId || id)
        }
        if (type === 'POS_COLLECTION' || type === 'POS_VOID') {
            return `/modules/sd/pos`
        }
        if (type === 'SALES_ORDER' || type.includes('POS') || type.includes('ORDER')) {
            return `/modules/sd/sales-orders`
        }
        return `/modules/sd/sales-orders`
    }

    if (module === 'MM' || module === 'RETURNS_DISPOSAL') {
        if (type.includes('SUPPLIER_INVOICE') || type === 'MM_SUPPLIER_INVOICE') {
            return `/modules/mm/procurement/supplier-invoices`
        }
        if (type.includes('GR') || type.includes('GOODS_RECEIPT')) {
            return `/modules/mm/receiving`
        }
        if (type.includes('CUSTOMER_RETURN') || type.includes('RETURN')) {
            // Prefer SD return request when metadata carries it; else list page.
            return customerReturnsHref(returnRequestId)
        }
        return null
    }

    if (module === 'AR') {
        if (type.includes('INVOICE') || type === 'SALES_INVOICE') {
            return `/modules/sd/billing/${id}`
        }
        return `/modules/fico/accounts-receivable`
    }

    // AP UI is not shipped yet; keep the id visible without a dead route.
    return null
}

export function journalSourceSecondaryLabel(source: JournalSourceFields): string | undefined {
    const type = source.sourceDocumentType?.replace(/_/g, ' ')
    const id = source.sourceDocumentId
    if (type && id) return `${type} · ${id.slice(0, 12)}${id.length > 12 ? '…' : ''}`
    if (type) return type
    if (id) return id.length > 18 ? `${id.slice(0, 16)}…` : id
    const posRef =
        source.description?.match(/POS-\d+/i)?.[0] ?? null
    return posRef ?? undefined
}

export function JournalSourceBadge({
    sourceModule,
    className,
}: {
    sourceModule?: string | null
    className?: string
}) {
    return (
        <StatusBadge tone={journalSourceTone(sourceModule)} className={className}>
            {journalSourceBadgeLabel(sourceModule)}
        </StatusBadge>
    )
}

export function JournalSourceLink({
    source,
    children,
}: {
    source: JournalSourceFields
    children?: ReactNode
}) {
    const href = resolveJournalSourceHref(source)
    const label = children ?? journalSourceSecondaryLabel(source) ?? source.sourceDocumentId
    if (!label) return <span className="text-sm text-gray-400">—</span>
    if (!href) {
        return <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
    }
    return (
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
            {label}
        </Link>
    )
}
