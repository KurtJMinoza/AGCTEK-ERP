import { randomUUID } from 'crypto'
import { resolveEventVersion } from './mm-event-catalog.registry'
import {
    MM_EVENT_VERSIONS,
    type MmIntegrationEventEnvelope,
    type MmIntegrationEventInput,
} from './mm-integration-event.types'

export function buildIntegrationEnvelope(
    input: MmIntegrationEventInput,
): MmIntegrationEventEnvelope {
    const eventVersion = resolveEventVersion(
        input.eventType,
        input.eventVersion,
    )
    const correlationId = input.correlationId ?? randomUUID()
    const eventId = input.eventId ?? randomUUID()

    return {
        eventId,
        eventType: input.eventType,
        eventVersion,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        companyId: input.companyId,
        plantId: input.plantId ?? null,
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        correlationId,
        causationId: input.causationId ?? null,
        actorId: input.actorId ?? null,
        payload: input.payload,
        metadata: input.metadata,
        documentReferences: input.documentReferences,
    }
}

/** Map envelope to legacy MmDomainEventPayload shape for backward-compatible emitters. */
export function envelopeToLegacyPayload(
    envelope: MmIntegrationEventEnvelope,
): {
    eventType: string
    companyId: string
    sourceModule: string
    documentType: string
    documentId: string
    occurredAt: string
    payload: Record<string, unknown>
} {
    return {
        eventType: envelope.eventType,
        companyId: envelope.companyId,
        sourceModule: envelope.sourceModule,
        documentType: envelope.sourceEntityType,
        documentId: envelope.sourceEntityId,
        occurredAt: envelope.occurredAt,
        payload: {
            ...envelope.payload,
            ...(envelope.documentReferences?.length
                ? { documentReferences: envelope.documentReferences }
                : {}),
            eventVersion: envelope.eventVersion,
            correlationId: envelope.correlationId,
            causationId: envelope.causationId,
            actorId: envelope.actorId,
            plantId: envelope.plantId,
        },
    }
}

export function upgradePayloadToV2(
    payload: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...payload,
        schemaVersion: MM_EVENT_VERSIONS.V2,
    }
}
