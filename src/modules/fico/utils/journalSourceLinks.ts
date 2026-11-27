import type { FicoJournalEntry } from '../types'

/** Map MM/SD source document types to existing ERP list/detail hubs. */
export function journalSourceDocumentHref(
    sourceModule: string | null | undefined,
    sourceDocumentType: string | null | undefined,
    sourceDocumentId: string | null | undefined,
): string | null {
    if (!sourceDocumentId) return null
    const module = (sourceModule || '').toUpperCase()
    const docType = (sourceDocumentType || '').toUpperCase().replace(/[\s-]+/g, '_')

    if (
        module === 'RETURNS_DISPOSAL' ||
        docType.includes('CUSTOMER_RETURN') ||
        docType.includes('SUPPLIER_RETURN')
    ) {
        if (docType.includes('CUSTOMER_RETURN')) {
            return `/modules/sd/customer-returns`
        }
        return `/modules/mm/returns-disposal/supplier-returns`
    }

    if (module === 'MM' || docType.startsWith('MM_') || docType.includes('GOODS') || docType.includes('ADJUST')) {
        if (docType.includes('GOODS_RECEIPT') || docType === 'GR' || docType === 'MM_GR') {
            return `/modules/mm/inventory-management/goods-receipt`
        }
        if (docType.includes('GOODS_ISSUE') || docType === 'GI' || docType === 'MM_GI') {
            return `/modules/mm/inventory-management/goods-issue`
        }
        if (docType.includes('ADJUST') || docType === 'MM_ADJUSTMENT') {
            return `/modules/mm/inventory-management/inventory-adjustments`
        }
        return `/modules/mm/inventory-management/stock-movements`
    }

    if (module === 'SD') {
        return `/modules/sd/sales-orders`
    }

    return null
}

export function journalAccountingEventHref(eventId: string | null | undefined) {
    if (!eventId) return null
    return `/modules/fico/gl-accounts?tab=events&eventId=${encodeURIComponent(eventId)}`
}

export function journalSourceModuleLabel(entry: Pick<FicoJournalEntry, 'sourceModule'>) {
    if (!entry.sourceModule) return 'Manual'
    return entry.sourceModule.toUpperCase()
}

export function isAutomatedJournal(
    entry: Pick<FicoJournalEntry, 'sourceModule'>,
) {
    return Boolean(entry.sourceModule?.trim())
}
