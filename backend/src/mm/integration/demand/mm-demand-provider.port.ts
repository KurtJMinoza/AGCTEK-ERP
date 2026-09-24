import type { MmDemandQuery, MmNormalizedDemandLine } from './mm-demand.types'

/**
 * Generic demand provider — external modules (SD, Production, Maintenance, Projects)
 * expose open material demand through this port. MM does not own their documents.
 */
export interface MmDemandProvider {
    /** Module identifier e.g. SD, PRODUCTION, MAINTENANCE, PROJECTS */
    readonly moduleId: string

    /** List open demand lines normalized to the MM contract. */
    listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]>
}

export const MM_DEMAND_PROVIDERS = Symbol('MM_DEMAND_PROVIDERS')
