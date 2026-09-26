import type { MmIntegrationEventEnvelope } from './mm-integration-event.types'

/** Consumer dedupe key — same event delivered twice must not duplicate side effects. */
export function buildEventDedupeKey(
    eventType: string,
    sourceEntityType: string,
    sourceEntityId: string,
    eventVersion?: string,
): string {
    const parts = [eventType, sourceEntityType, sourceEntityId]
    if (eventVersion) parts.push(eventVersion)
    return parts.join(':')
}

export function dedupeKeyFromEnvelope(
    envelope: MmIntegrationEventEnvelope,
): string {
    return buildEventDedupeKey(
        envelope.eventType,
        envelope.sourceEntityType,
        envelope.sourceEntityId,
        envelope.eventVersion,
    )
}

export function consumerReceiptKey(
    consumerId: string,
    dedupeKey: string,
): string {
    return `${consumerId}:${dedupeKey}`
}
