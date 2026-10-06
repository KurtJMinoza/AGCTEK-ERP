import type { OpportunityStage } from './dto/opportunity.dto'

export const LOST_REASONS = [
    'PRICE',
    'COMPETITOR',
    'NO_BUDGET',
    'NO_DECISION',
    'TIMING',
    'REQUIREMENTS_MISMATCH',
    'UNRESPONSIVE',
    'OTHER',
] as const
export type LostReason = (typeof LOST_REASONS)[number]

/** Lost reasons that need explanatory `lostNotes`. */
export const LOST_REASONS_REQUIRING_NOTES: ReadonlySet<string> = new Set<LostReason>(['OTHER'])

export type StageMeta = {
    stage: OpportunityStage
    /** Pipeline position for forward/backward detection; null for CLOSED_LOST (outside the funnel). */
    order: number | null
    defaultProbability: number
    isWon: boolean
    isLost: boolean
    /** Linked SdCustomer must be ACTIVE (SD will not take orders for BLOCKED customers). */
    requiresCustomer: boolean
    requiresAmount: boolean
    requiresExpectedClose: boolean
}

const meta = (
    stage: OpportunityStage,
    order: number | null,
    defaultProbability: number,
    flags: Partial<Omit<StageMeta, 'stage' | 'order' | 'defaultProbability'>> = {},
): StageMeta => ({
    stage,
    order,
    defaultProbability,
    isWon: false,
    isLost: false,
    requiresCustomer: false,
    requiresAmount: false,
    requiresExpectedClose: false,
    ...flags,
})

/** Single source of stage metadata; served to the UI via GET /crm/opportunities/stages. */
export const OPPORTUNITY_STAGE_META: readonly StageMeta[] = [
    meta('PROSPECTING', 0, 10),
    meta('QUALIFICATION', 1, 25),
    meta('PROPOSAL', 2, 50, { requiresAmount: true, requiresExpectedClose: true }),
    meta('NEGOTIATION', 3, 75, { requiresAmount: true, requiresExpectedClose: true }),
    meta('CLOSED_WON', 4, 100, { isWon: true, requiresCustomer: true, requiresAmount: true }),
    meta('CLOSED_LOST', null, 0, { isLost: true }),
]

const BY_STAGE = new Map(OPPORTUNITY_STAGE_META.map((m) => [m.stage, m]))

export function stageMeta(stage: string): StageMeta {
    const found = BY_STAGE.get(stage as OpportunityStage)
    if (!found) throw new Error(`Unknown opportunity stage ${stage}`)
    return found
}

/**
 * Gates apply when a move advances the funnel: a higher open/won position, or re-entering
 * the funnel from CLOSED_LOST. Backward moves (including reopening CLOSED_WON) are ungated.
 */
export function isForwardMove(from: string, to: string) {
    if (from === to) return false
    const fromOrder = stageMeta(from).order
    const toOrder = stageMeta(to).order
    if (toOrder === null) return false
    if (fromOrder === null) return true
    return toOrder > fromOrder
}

export type GateInput = {
    amount: unknown | null
    expectedCloseDate: Date | null
    customerStatus: string | null
}

/** Human-readable unmet requirements for `stage` (empty when the gate passes). */
export function unmetStageRequirements(stage: string, input: GateInput): string[] {
    const m = stageMeta(stage)
    const missing: string[] = []
    if (m.requiresAmount && input.amount == null) missing.push('an amount')
    if (m.requiresExpectedClose && !input.expectedCloseDate) missing.push('an expected close date')
    if (m.requiresCustomer && input.customerStatus !== 'ACTIVE') {
        missing.push('an active SD customer')
    }
    return missing
}
