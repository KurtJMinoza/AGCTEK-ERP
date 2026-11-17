import { assertCompareAt } from './product-price.rules'
import { BadRequestException } from '@nestjs/common'

describe('assertCompareAt', () => {
    it('should allow null compare-at (no promo)', () => {
        expect(() => assertCompareAt(100, null, 'compareAtPrice')).not.toThrow()
    })

    it('should allow when compare-at > sell price', () => {
        expect(() => assertCompareAt(100, 150, 'compareAtPrice')).not.toThrow()
    })

    it('should reject when compare-at equals sell price', () => {
        expect(() => assertCompareAt(100, 100, 'compareAtPrice')).toThrow(BadRequestException)
    })

    it('should reject when compare-at < sell price', () => {
        expect(() => assertCompareAt(100, 50, 'compareAtPrice')).toThrow(BadRequestException)
    })

    it('should use custom field name in error message', () => {
        try {
            assertCompareAt(100, 50, 'originalPrice')
        } catch (e: any) {
            expect(e.getStatus()).toBe(400)
            expect(e.message).toContain('originalPrice must be higher than the selling price')
        }
    })

    it('should default field to compareAtPrice', () => {
        try {
            assertCompareAt(100, 50)
        } catch (e: any) {
            expect(e.getStatus()).toBe(400)
            expect(e.message).toContain('compareAtPrice must be higher than the selling price')
        }
    })
})
