/**
 * Ocular trip ↔ CRM lead contract (EventEmitter2, in-process). SCM owns trips and stops;
 * CRM owns leads. Neither writes the other's tables: CRM emits when a lead is captured at a
 * stop, SCM's listener records `createdLeadId` on that stop. Handlers are idempotent.
 */
export const OCULAR_EVENTS = {
    /** CRM created a lead from an ocular stop (`source = OCULAR`); SCM links it to the stop. */
    LEAD_CAPTURED: 'crm.lead.captured-at-ocular-stop',
} as const

export type OcularLeadCapturedEvent = { leadId: string; tripStopId: string }
