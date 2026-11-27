/**
 * Phase 03 — stable accounting event idempotency keys.
 * Retries must reuse the same key; never derive a new key on retry.
 */

export type AccountingIdempotencyInput = {
    companyId: string
    sourceModule: string
    sourceDocumentType: string
    sourceDocumentId: string
    postingPurpose: string
    businessOccurrenceId: string
}

export function ficoBuildAccountingIdempotencyKey(
    input: AccountingIdempotencyInput,
): string {
    const companyId = input.companyId.trim()
    const module = input.sourceModule.trim().toUpperCase()
    const docType = input.sourceDocumentType.trim().toUpperCase()
    const docId = input.sourceDocumentId.trim()
    const purpose = input.postingPurpose.trim().toUpperCase() || 'DEFAULT'
    const occurrence = input.businessOccurrenceId.trim() || docId
    return `${companyId}:${module}:${docType}:${docId}:${purpose}:${occurrence}`
}

export function ficoDerivePostingPurpose(
    eventType: string,
    accountingEffects: string[] | undefined,
): string {
    if (accountingEffects?.length) {
        return accountingEffects
            .map((effect) => effect.trim().toUpperCase())
            .sort()
            .join('|')
    }
    return eventType.trim().toUpperCase()
}