export const STO_STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger'
> = {
    DRAFT: 'default',
    SUBMITTED: 'warning',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    ALLOCATED: 'success',
    PICKING: 'warning',
    DISPATCHED: 'warning',
    IN_TRANSIT: 'warning',
    PARTIALLY_RECEIVED: 'warning',
    FULLY_RECEIVED: 'success',
    CLOSED: 'success',
    CANCELLED: 'danger',
}

export function fmtStoDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export function errMsg(err: unknown): string {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message
    if (Array.isArray(msg)) return msg.join(', ')
    return msg || 'An error occurred'
}
