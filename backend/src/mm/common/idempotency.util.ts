/**
 * Deterministic idempotency keys for MM posting operations.
 * @see docs/MM_TRANSACTION_RULES.md
 */
export function postingKey(
    domain: string,
    documentId: string,
    lineId?: string,
    suffix?: string,
): string {
    const parts = [domain, documentId]
    if (lineId) parts.push(lineId)
    if (suffix) parts.push(suffix)
    return parts.join(':')
}

export function reversalKey(originalTxnId: string, clientKey?: string): string {
    return clientKey ?? `reversal:${originalTxnId}`
}
