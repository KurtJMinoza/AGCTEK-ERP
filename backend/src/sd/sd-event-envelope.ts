/** Payload shape emitted by {@link SdEventEmitterService}. */
export type SdDomainEventEnvelope<T extends Record<string, unknown>> = {
    eventId: string
    eventType: string
    eventVersion: string
    occurredAt: string
    payload: T
}

export function unwrapSdEventPayload<T>(event: unknown): T {
    if (
        event &&
        typeof event === 'object' &&
        'payload' in event &&
        (event as { payload?: unknown }).payload &&
        typeof (event as { payload: unknown }).payload === 'object'
    ) {
        return (event as SdDomainEventEnvelope<Record<string, unknown>>)
            .payload as T
    }
    return event as T
}