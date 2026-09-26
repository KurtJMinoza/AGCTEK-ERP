/**
 * Phase 3A — formal MM integration event envelope and versioning.
 * @see docs/MM_INTEGRATION_CONTRACTS.md
 */

export const MM_EVENT_VERSIONS = {
    V1: 'v1',
    V2: 'v2',
} as const

export type MmEventVersion =
    (typeof MM_EVENT_VERSIONS)[keyof typeof MM_EVENT_VERSIONS]

export type MmDocumentReference = {
    entityType: string
    entityId: string
}

/** Canonical integration envelope persisted to outbox and emitted in-process. */
export type MmIntegrationEventEnvelope = {
    eventId: string
    eventType: string
    eventVersion: MmEventVersion
    occurredAt: string
    companyId: string
    plantId?: string | null
    sourceModule: string
    sourceEntityType: string
    sourceEntityId: string
    correlationId: string
    causationId?: string | null
    actorId?: string | null
    payload: Record<string, unknown>
    metadata?: Record<string, unknown>
    /** Lightweight document pointers — never embed full documents. */
    documentReferences?: MmDocumentReference[]
}

export type MmIntegrationEventInput = {
    eventType: string
    companyId: string
    sourceModule: string
    sourceEntityType: string
    sourceEntityId: string
    payload: Record<string, unknown>
    eventVersion?: MmEventVersion
    plantId?: string | null
    correlationId?: string
    causationId?: string | null
    actorId?: string | null
    metadata?: Record<string, unknown>
    documentReferences?: MmDocumentReference[]
    occurredAt?: string
    eventId?: string
}

export type MmOutboxStatus =
    | 'PENDING'
    | 'DISPATCHED'
    | 'FAILED'
    | 'DEAD_LETTER'

export type MmConsumerReceiptStatus = 'PROCESSED' | 'FAILED'
