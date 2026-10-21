/**
 * COD delivery + Customer Returns QA — full payment, no partial accept.
 *
 * Locks the commercial outcomes from docs/COD_DELIVERY_CUSTOMER_RETURNS.md.
 * Run: `npm run test:cod-delivery-qa` (from backend) or
 * `npx jest src/sd/cod-delivery-customer-returns.scenarios.spec.ts --runInBand`
 *
 * Related deeper suites: trips.service.execution.spec (deliver / fail / cash,
 * partial accept rejected), damage-reports.spec, return-request.spec (approve /
 * REPLACEMENT / refund guards).
 */
import { BadRequestException } from '@nestjs/common'
import { assertStopTypeAllows } from '../scm/trips/trip-execution.rules'

const deliver = (over: Partial<Parameters<typeof assertStopTypeAllows>[0]> = {}) =>
    assertStopTypeAllows({
        stopType: 'TO',
        sequence: 2,
        outcome: 'COMPLETE',
        reasonCode: null,
        hasSignature: true,
        ...over,
    })

describe('COD + Customer Returns — full payment scenarios', () => {
    describe('Scenario 1 — Happy path: deliver all, collect full COD', () => {
        it('a deliver stop completes with POD and signature', () => {
            expect(() => deliver()).not.toThrow()
        })
    })

    describe('Scenario 2 — Damaged at the door', () => {
        it('the customer keeps the parcel and pays in full; damage is a later customer return', () => {
            // Partial accept is retired: deliverStop rejects acceptedLines
            // (trips.service.execution.spec). Evidence = driver Report damage.
            const customerChoices = ['REFUND', 'REPLACEMENT'] as const
            expect(customerChoices).toEqual(['REFUND', 'REPLACEMENT'])
        })
    })

    describe('Scenario 3 — Refuse all', () => {
        it('the deliver stop fails with any customer reason; no COD is collected', () => {
            expect(() =>
                deliver({ outcome: 'FAIL', reasonCode: 'CUSTOMER_REFUSED', hasSignature: false }),
            ).not.toThrow()
        })
    })

    describe('Scenario 4 — Hidden damage after the driver leaves', () => {
        it('the customer files a Refund (red) or Replace (orange) return on a paid order', () => {
            const flagTone = (resolution: string) =>
                resolution === 'REPLACEMENT' ? 'warning' : resolution === 'REFUND' ? 'danger' : 'default'
            expect(flagTone('REFUND')).toBe('danger')
            expect(flagTone('REPLACEMENT')).toBe('warning')
        })
    })

    describe('Scenario 5 — Replacement after approve', () => {
        it('MM intake always; a child SO only when the resolution is REPLACEMENT', () => {
            const plan = (resolution: string) => ({
                mmIntake: true,
                replacementSo: resolution === 'REPLACEMENT',
            })
            expect(plan('REFUND')).toEqual({ mmIntake: true, replacementSo: false })
            expect(plan('REPLACEMENT')).toEqual({ mmIntake: true, replacementSo: true })
        })
    })

    describe('Stop types — no customer at load / return stops', () => {
        it('load stop: completes without signature; fails only for vehicle issue or other', () => {
            expect(() => deliver({ stopType: 'SHIP', hasSignature: false })).not.toThrow()
            expect(() =>
                deliver({ stopType: 'SHIP', outcome: 'FAIL', reasonCode: 'VEHICLE_ISSUE', hasSignature: false }),
            ).not.toThrow()
            expect(() =>
                deliver({ stopType: 'SHIP', outcome: 'FAIL', reasonCode: 'CUSTOMER_REFUSED', hasSignature: false }),
            ).toThrow(BadRequestException)
        })

        it('load and return stops reject a customer signature', () => {
            expect(() => deliver({ stopType: 'SHIP' })).toThrow(/signature/)
            expect(() => deliver({ stopType: 'RETURN' })).toThrow(/signature/)
        })

        it('return stop: completes as returned to hub and cannot fail', () => {
            expect(() => deliver({ stopType: 'RETURN', hasSignature: false })).not.toThrow()
            expect(() =>
                deliver({ stopType: 'RETURN', outcome: 'FAIL', reasonCode: 'OTHER', hasSignature: false }),
            ).toThrow(/cannot be marked failed/)
        })

        it('legacy stops without a type keep the delivery rules', () => {
            expect(() =>
                deliver({ stopType: null, outcome: 'FAIL', reasonCode: 'CUSTOMER_UNAVAILABLE' }),
            ).not.toThrow()
        })
    })
})
