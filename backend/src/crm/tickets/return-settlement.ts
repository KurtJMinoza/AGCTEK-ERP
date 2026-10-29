import type { TicketStatus } from './dto/ticket.dto'

/** Ticket statuses that end the agent's work on a return case: allowed only once the return is settled. */
export const RETURN_GATED_TICKET_STATUSES: ReadonlySet<TicketStatus> = new Set([
    'RESOLVED',
    'CLOSED',
    'CANCELLED',
])

export type ReturnSettlement = { settled: true; blocker: null } | { settled: false; blocker: string }

type SettlementInput = {
    status: string
    preferredResolution: string | null
    refundStatus: string
}

const SETTLED: ReturnSettlement = { settled: true, blocker: null }
const blocked = (blocker: string): ReturnSettlement => ({ settled: false, blocker })

const FINISHED = new Set(['CLOSED', 'REJECTED', 'CANCELLED'])
const AWAITING_GOODS = new Set(['APPROVED', 'AWAITING_RETURN'])
const IN_INSPECTION = new Set(['RECEIVED', 'UNDER_INSPECTION'])
const DISPOSITIONED = new Set(['RESTOCKED', 'MARKED_DAMAGED', 'SCRAPPED', 'REFUNDED'])

const REFUND_BLOCKERS: Record<string, string> = {
    NONE: 'the refund has not been recorded in SD yet',
    PENDING_REFUND: 'the refund is waiting for approval in SD',
    APPROVED: 'the refund is approved and waiting for payment by finance',
    FAILED: 'the refund payment failed and needs finance follow-up',
}

/**
 * Whether the SD return behind a case is physically and financially resolved (RMA work instruction):
 * decided, goods received and dispositioned, and any refund paid. SD stays the owner of the return.
 */
export function returnSettlement(request: SettlementInput): ReturnSettlement {
    if (FINISHED.has(request.status)) return SETTLED
    if (request.status === 'REQUESTED') return blocked('the return is still waiting for a decision')
    if (AWAITING_GOODS.has(request.status)) {
        return blocked('the returned goods have not been received yet')
    }
    if (IN_INSPECTION.has(request.status)) return blocked('the returned goods are still being inspected')
    if (!DISPOSITIONED.has(request.status)) {
        return blocked(`the return is ${request.status.toLowerCase().replace(/_/g, ' ')}`)
    }
    const refundOpen =
        request.refundStatus !== 'PAID' &&
        request.refundStatus !== 'NOT_REQUIRED' &&
        (request.preferredResolution === 'REFUND' || request.refundStatus !== 'NONE')
    if (refundOpen) {
        return blocked(REFUND_BLOCKERS[request.refundStatus] ?? 'the refund is not paid yet')
    }
    return SETTLED
}
