import { unwrapSdEventPayload } from './sd-event-envelope'

describe('unwrapSdEventPayload', () => {
    it('returns nested payload from SD domain envelope', () => {
        const inner = { salesOrderId: 'so-1', companyId: 'co-1' }
        expect(
            unwrapSdEventPayload({
                eventId: 'e1',
                eventType: 'PosSaleCompleted',
                eventVersion: 'v1',
                occurredAt: new Date().toISOString(),
                payload: inner,
            }),
        ).toEqual(inner)
    })

    it('passes through a flat payload', () => {
        const flat = { salesOrderId: 'so-2', companyId: 'co-2' }
        expect(unwrapSdEventPayload(flat)).toEqual(flat)
    })
})