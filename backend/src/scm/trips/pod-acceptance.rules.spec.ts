import { BadRequestException } from '@nestjs/common'
import {
    hasAnyAccept,
    hasPartialReject,
    parseAcceptedLines,
    proportionalCodDue,
} from './pod-acceptance.rules'

const LINES = [
    { id: 'sl-1', shipmentId: 'sh-1', quantity: 10 },
    { id: 'sl-2', shipmentId: 'sh-1', quantity: 4 },
]

describe('parseAcceptedLines', () => {
    it('returns null when omitted or empty', () => {
        expect(parseAcceptedLines(undefined, LINES)).toBeNull()
        expect(parseAcceptedLines([], LINES)).toBeNull()
    })

    it('fills omitted lines as fully accepted', () => {
        const resolved = parseAcceptedLines(
            [{ shipmentLineId: 'sl-1', acceptedQuantity: 8 }],
            LINES,
        )!
        expect(resolved).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    shipmentLineId: 'sl-1',
                    acceptedQuantity: 8,
                    rejectedQuantity: 2,
                }),
                expect.objectContaining({
                    shipmentLineId: 'sl-2',
                    acceptedQuantity: 4,
                    rejectedQuantity: 0,
                }),
            ]),
        )
        expect(hasPartialReject(resolved)).toBe(true)
        expect(hasAnyAccept(resolved)).toBe(true)
    })

    it('rejects accept above shipped qty', () => {
        expect(() =>
            parseAcceptedLines([{ shipmentLineId: 'sl-1', acceptedQuantity: 11 }], LINES),
        ).toThrow(BadRequestException)
    })

    it('rejects unknown shipment lines', () => {
        expect(() =>
            parseAcceptedLines([{ shipmentLineId: 'nope', acceptedQuantity: 1 }], LINES),
        ).toThrow(/not on a DROPOFF/)
    })

    it('detects refuse-all', () => {
        const resolved = parseAcceptedLines(
            [
                { shipmentLineId: 'sl-1', acceptedQuantity: 0 },
                { shipmentLineId: 'sl-2', acceptedQuantity: 0 },
            ],
            LINES,
        )!
        expect(hasAnyAccept(resolved)).toBe(false)
        expect(hasPartialReject(resolved)).toBe(true)
    })
})

describe('proportionalCodDue', () => {
    it('scales the full due by accepted / shipped', () => {
        const lines = parseAcceptedLines(
            [{ shipmentLineId: 'sl-1', acceptedQuantity: 8 }],
            LINES,
        )!
        // 8+4 accepted of 10+4 shipped = 12/14 of 1400
        expect(proportionalCodDue(1400, lines)).toBe(1200)
    })

    it('returns full due when nothing rejected', () => {
        const lines = parseAcceptedLines(
            [{ shipmentLineId: 'sl-1', acceptedQuantity: 10 }],
            LINES,
        )!
        expect(proportionalCodDue(1299, lines)).toBe(1299)
    })

    it('returns 0 when nothing accepted', () => {
        const lines = parseAcceptedLines(
            [
                { shipmentLineId: 'sl-1', acceptedQuantity: 0 },
                { shipmentLineId: 'sl-2', acceptedQuantity: 0 },
            ],
            LINES,
        )!
        expect(proportionalCodDue(1299, lines)).toBe(0)
    })
})
