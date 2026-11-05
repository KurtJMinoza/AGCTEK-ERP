import { BadRequestException } from '@nestjs/common'
import {
    assertAccountCodeFormat,
    doRangesOverlap,
    isCodeInRange,
    isRangeWithin,
    normalizeAccountCodeLength,
    normalizeAccountCodeRange,
} from './fico-coa-rules'

describe('FICO chart-of-accounts code rules', () => {
    it('enforces the chart account-code length', () => {
        expect(() => assertAccountCodeFormat('1010', 4)).not.toThrow()
        expect(() => assertAccountCodeFormat('101', 4)).toThrow(BadRequestException)
        expect(() => assertAccountCodeFormat('120100', null)).not.toThrow()
        expect(() => assertAccountCodeFormat('10 10', null)).toThrow(BadRequestException)
    })

    it('rejects an invalid code length', () => {
        expect(normalizeAccountCodeLength(undefined)).toBeNull()
        expect(normalizeAccountCodeLength(4)).toBe(4)
        expect(() => normalizeAccountCodeLength(0)).toThrow(BadRequestException)
        expect(() => normalizeAccountCodeLength(2.5)).toThrow(BadRequestException)
    })

    it('requires both range bounds, equal length, and start <= end', () => {
        expect(normalizeAccountCodeRange('', null, 4)).toEqual({
            rangeFrom: null,
            rangeTo: null,
        })
        expect(normalizeAccountCodeRange('1000', '1999', 4)).toEqual({
            rangeFrom: '1000',
            rangeTo: '1999',
        })
        expect(() => normalizeAccountCodeRange('1000', null, 4)).toThrow(
            BadRequestException,
        )
        expect(() => normalizeAccountCodeRange('1000', '199', null)).toThrow(
            BadRequestException,
        )
        expect(() => normalizeAccountCodeRange('1999', '1000', 4)).toThrow(
            BadRequestException,
        )
        expect(() => normalizeAccountCodeRange('10000', '19999', 4)).toThrow(
            BadRequestException,
        )
    })

    it('checks codes and sub-ranges against a range', () => {
        const assets = { rangeFrom: '1000', rangeTo: '1999' }
        expect(isCodeInRange('1510', assets)).toBe(true)
        expect(isCodeInRange('2000', assets)).toBe(false)
        expect(isCodeInRange('100', assets)).toBe(false)
        expect(isCodeInRange('ANY', { rangeFrom: null, rangeTo: null })).toBe(true)
        expect(isRangeWithin({ rangeFrom: '1000', rangeTo: '1099' }, assets)).toBe(true)
        expect(isRangeWithin({ rangeFrom: '1900', rangeTo: '2099' }, assets)).toBe(false)
    })

    it('detects overlapping sibling ranges', () => {
        const income = { rangeFrom: '7000', rangeTo: '7099' }
        expect(doRangesOverlap(income, { rangeFrom: '7100', rangeTo: '7199' })).toBe(false)
        expect(doRangesOverlap(income, { rangeFrom: '7050', rangeTo: '7150' })).toBe(true)
        expect(doRangesOverlap(income, { rangeFrom: null, rangeTo: null })).toBe(false)
    })
})
