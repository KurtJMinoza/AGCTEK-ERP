export type FicoJournalPostingOrigin =
    | 'MANUAL'
    | 'AUTOMATIC'
    | 'REVERSAL'
    | 'SYSTEM_ADJUSTMENT'

export type FicoJournalReversalStatus =
    | 'NONE'
    | 'IS_REVERSAL'
    | 'ORIGINAL_REVERSED'
    | 'CANCELLED'

const SYSTEM_DOCUMENT_TYPES = new Set([
    'OPENING_BALANCE',
    'YEAR_END_CLOSE',
    'PERIOD_CLOSE',
    'FICO_OPENING',
])

export function resolveJournalPostingOrigin(entry: {
    reversalOfId?: string | null
    sourceModule?: string | null
    documentType?: string | null
    metadata?: unknown
}): FicoJournalPostingOrigin {
    if (entry.reversalOfId) return 'REVERSAL'
    const docType = (entry.documentType ?? '').toUpperCase()
    if (docType.includes('REVERSAL')) return 'REVERSAL'
    if (SYSTEM_DOCUMENT_TYPES.has(docType)) return 'SYSTEM_ADJUSTMENT'
    const meta = entry.metadata as Record<string, unknown> | null | undefined
    if (meta?.postingOrigin === 'SYSTEM_ADJUSTMENT' || meta?.source === 'OPENING_BALANCE') {
        return 'SYSTEM_ADJUSTMENT'
    }
    if (entry.sourceModule?.trim()) return 'AUTOMATIC'
    return 'MANUAL'
}

export function resolveJournalReversalStatus(entry: {
    status: string
    reversalOfId?: string | null
    hasReversalChild?: boolean
}): FicoJournalReversalStatus {
    if (entry.status === 'CANCELLED') return 'CANCELLED'
    if (entry.reversalOfId) return 'IS_REVERSAL'
    if (entry.hasReversalChild || entry.status === 'REVERSED') {
        return 'ORIGINAL_REVERSED'
    }
    return 'NONE'
}

export function manualJournalReversalPermitted(sourceModule: string | null | undefined): boolean {
    const module = sourceModule?.trim().toUpperCase() ?? ''
    if (!module) return true
    if (module === 'AP' || module === 'AR') return false
    if (module === 'MM' || module === 'SD' || module === 'PP') return false
    return true
}