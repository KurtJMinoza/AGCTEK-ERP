import { Prisma } from '@prisma/client'
import { OPPORTUNITY_OPEN_STAGES } from '../opportunities/dto/opportunity.dto'
import { CADENCE_LIST_LIMIT } from './dashboard-cadence'
import { STALL_DEFAULT_THRESHOLD_DAYS } from './dashboard.dto'

export { CADENCE_LIST_LIMIT as STALL_LIST_LIMIT }
export { STALL_DEFAULT_THRESHOLD_DAYS }

const DAY_MS = 24 * 60 * 60 * 1000

/** Instant when an open opportunity becomes stalled at the given threshold. */
export function stallCutoff(now: Date, thresholdDays: number) {
    return new Date(now.getTime() - thresholdDays * DAY_MS)
}

/**
 * Open opportunities whose current stage age exceeds the threshold.
 * Age is measured from `stageEnteredAt` (not `updatedAt`).
 */
export function stalledOpportunityWhere(
    now: Date,
    thresholdDays: number,
    assignedTo?: string,
): Prisma.CrmOpportunityWhereInput {
    return {
        stage: { in: [...OPPORTUNITY_OPEN_STAGES] },
        stageEnteredAt: { lte: stallCutoff(now, thresholdDays) },
        ...(assignedTo ? { assignedTo } : {}),
    }
}

export function daysInStage(stageEnteredAt: Date, now: Date) {
    return Math.max(0, Math.floor((now.getTime() - stageEnteredAt.getTime()) / DAY_MS))
}
