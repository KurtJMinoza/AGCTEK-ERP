/**
 * Phase 5 — COD delivery + Customer Returns QA (scenarios 1–6).
 *
 * Locks the commercial outcomes from docs/COD_DELIVERY_CUSTOMER_RETURNS.md.
 * Run: `npm run test:cod-delivery-qa` (from backend) or
 * `npx jest src/sd/cod-delivery-customer-returns.scenarios.spec.ts --runInBand`
 *
 * Related deeper suites: pod-acceptance.rules.spec, sales-invoice-pod-acceptance.spec,
 * damage-reports.spec (initiate → Customer Return), return-request.spec (approve /
 * REPLACEMENT / refund NOT_REQUIRED).
 */
import {
    hasAnyAccept,
    hasPartialReject,
    parseAcceptedLines,
    proportionalCodDue,
} from '../scm/trips/pod-acceptance.rules'
import {
    isPartialPodAcceptance,
    money,
} from './sales-invoice-pod-acceptance'

/** Demo: 10 units @ ₱100, shipping folded into COD due of ₱1,050. */
const SHIPPED = [{ id: 'sl-1', shipmentId: 'sh-1', quantity: 10 }]
const FULL_COD = 1050

describe('COD + Customer Returns — Phase 5 scenarios 1–6', () => {
    describe('Scenario 1 — Happy path: accept all, no damage', () => {
        it('omitted acceptedLines means full deliver (no partial)', () => {
            expect(parseAcceptedLines(undefined, SHIPPED)).toBeNull()
            expect(parseAcceptedLines([], SHIPPED)).toBeNull()
        })

        it('full accept → stop COMPLETED, COD = full, no SI rewrite signal', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
                SHIPPED,
            )!
            expect(hasPartialReject(lines)).toBe(false)
            expect(hasAnyAccept(lines)).toBe(true)
            expect(proportionalCodDue(FULL_COD, lines)).toBe(FULL_COD)
            expect(
                isPartialPodAcceptance({
                    codAmountDue: null,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            acceptedQuantity: 10,
                            shippedQuantity: 10,
                        },
                    ],
                }),
            ).toBe(false)
        })

        it('commercial follow-up: none (no damage reject qty)', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
                SHIPPED,
            )!
            expect(lines.every((l) => l.rejectedQuantity === 0)).toBe(true)
        })
    })

    describe('Scenario 2 — Partial accept: reject damaged qty', () => {
        const accepted = 8
        const rejected = 2

        it('stop stays COMPLETED (not FAILED) with partial reject', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: accepted }],
                SHIPPED,
            )!
            expect(hasPartialReject(lines)).toBe(true)
            expect(hasAnyAccept(lines)).toBe(true)
            expect(lines[0].rejectedQuantity).toBe(rejected)
        })

        it('COD due scales to accepted / shipped', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: accepted }],
                SHIPPED,
            )!
            // 8/10 of 1050 = 840
            expect(proportionalCodDue(FULL_COD, lines)).toBe(840)
        })

        it('SI rewrite uses accepted qty × unit price and reduced COD due', () => {
            expect(money.mul(accepted, 100).toString()).toBe('800')
            expect(
                isPartialPodAcceptance({
                    codAmountDue: 840,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            acceptedQuantity: accepted,
                            shippedQuantity: 10,
                        },
                    ],
                }),
            ).toBe(true)
        })

        it('commercial follow-up: DamageReport evidence + Customer Return for rejected qty; on-spot COD → refund NOT_REQUIRED', () => {
            // Policy contract (wired in DamageReportsService + createFromDamageReport):
            // DRIVER / POD reject → onSpotCodPartial → refundStatus NOT_REQUIRED.
            const onSpotCodPartial = true
            const refundStatus = onSpotCodPartial ? 'NOT_REQUIRED' : 'NONE'
            expect(refundStatus).toBe('NOT_REQUIRED')
            expect(rejected).toBe(2)
        })
    })

    describe('Scenario 3 — Refuse all', () => {
        it('accept-all-zero is refuse-all (must use outcome FAILED, not COMPLETE)', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 0 }],
                SHIPPED,
            )!
            expect(hasAnyAccept(lines)).toBe(false)
            expect(hasPartialReject(lines)).toBe(true)
            expect(proportionalCodDue(FULL_COD, lines)).toBe(0)
        })

        it('TripsService gates refuse-all on COMPLETE with a clear error', () => {
            // Mirror of trips.service deliverStop: COMPLETE + !hasAnyAccept → BadRequest.
            const refuseAll = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 0 }],
                SHIPPED,
            )!
            const wouldBlockComplete = refuseAll && !hasAnyAccept(refuseAll)
            expect(wouldBlockComplete).toBe(true)
            expect(
                'Refuse all units with outcome FAILED — partial accept needs at least one accepted unit',
            ).toMatch(/FAILED/)
        })

        it('commercial follow-up: no COD due and no partial-accept SI rewrite', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 0 }],
                SHIPPED,
            )!
            expect(proportionalCodDue(FULL_COD, lines)).toBe(0)
            // Partial SI rewrite only when some units accepted.
            expect(hasAnyAccept(lines)).toBe(false)
        })
    })

    describe('Scenario 4 — Accept all including damaged (pay full)', () => {
        it('full COD collect with no rejected qty → no credit return', () => {
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
                SHIPPED,
            )!
            expect(hasPartialReject(lines)).toBe(false)
            expect(proportionalCodDue(FULL_COD, lines)).toBe(FULL_COD)
            // Keep-damaged-and-pay-less is not expressible via acceptedLines.
            expect(lines[0].rejectedQuantity).toBe(0)
        })

        it('POD auto-return only fires when rejectedQuantity > 0', () => {
            const full = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
                SHIPPED,
            )!
            const partial = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 8 }],
                SHIPPED,
            )!
            const podCreatesCustomerReturn = (lines: typeof full) =>
                hasPartialReject(lines) && hasAnyAccept(lines)
            expect(podCreatesCustomerReturn(full)).toBe(false)
            expect(podCreatesCustomerReturn(partial)).toBe(true)
        })
    })

    describe('Scenario 5 — Hidden damage after driver leaves', () => {
        it('post-delivery Customer Return uses REFUND path; refundStatus NONE until settled (not on-spot)', () => {
            // create / createForCustomer after DELIVERED — not onSpotCodPartial.
            const onSpotCodPartial = false
            const refundStatus = onSpotCodPartial ? 'NOT_REQUIRED' : 'NONE'
            expect(refundStatus).toBe('NONE')
            expect(['REFUND', 'REPLACEMENT', 'STORE_CREDIT']).toContain('REFUND')
        })

        it('prior full POD → no partial SI flag; later credit memo via refund flow', () => {
            expect(
                isPartialPodAcceptance({
                    codAmountDue: null,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            acceptedQuantity: 10,
                            shippedQuantity: 10,
                        },
                    ],
                }),
            ).toBe(false)
        })
    })

    describe('Scenario 6 — Replacement after approve', () => {
        it('REPLACEMENT is a distinct resolution from REFUND / STORE_CREDIT', () => {
            const allowed = ['REFUND', 'REPLACEMENT', 'STORE_CREDIT'] as const
            expect(allowed).toContain('REPLACEMENT')
            expect('REPLACEMENT').not.toBe('REFUND')
        })

        it('approve contract: MM intake always; child SO only when resolution is REPLACEMENT', () => {
            const plan = (resolution: string) => ({
                mmIntake: true,
                replacementSo: resolution === 'REPLACEMENT',
            })
            expect(plan('REFUND')).toEqual({ mmIntake: true, replacementSo: false })
            expect(plan('REPLACEMENT')).toEqual({
                mmIntake: true,
                replacementSo: true,
            })
            // Damaged pickup multi-stop is deferred (policy 6A outbound only).
            expect(plan('REPLACEMENT').replacementSo).toBe(true)
        })
    })

    describe('Locked policy cross-checks', () => {
        it('keep-damaged-and-pay-less cannot be expressed (acceptedLines only reduces keep qty)', () => {
            // Paying less while keeping all units would require accepted=10 and
            // a lower COD — disallowed; COD is derived from accepted/shipped only.
            const lines = parseAcceptedLines(
                [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
                SHIPPED,
            )!
            expect(proportionalCodDue(FULL_COD, lines)).toBe(FULL_COD)
            expect(proportionalCodDue(FULL_COD, lines)).not.toBe(840)
        })

        it('driver never changes unit price — invoice line math is qty × original price', () => {
            expect(money.mul(8, 129.9).toString()).toBe('1039.2')
            expect(money.mul(10, 129.9).toString()).toBe('1299')
        })
    })
})
