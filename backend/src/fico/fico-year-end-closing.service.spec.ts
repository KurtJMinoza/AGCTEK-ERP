import { yearEndCloseIdempotencyKey } from './fico.constants'

describe('yearEndCloseIdempotencyKey', () => {
    it('is stable per company and fiscal year', () => {
        expect(yearEndCloseIdempotencyKey('co-1', 2026)).toBe(
            'YEAR_END_CLOSE:co-1:2026',
        )
    })
})