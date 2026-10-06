import { formatTrackingNumber } from './tracking-number.format'

describe('formatTrackingNumber', () => {
    it('normalizes letters+digits without separator', () => {
        expect(formatTrackingNumber('beef00001')).toBe('BEEF-00001')
        expect(formatTrackingNumber('BEEF00001')).toBe('BEEF-00001')
    })

    it('normalizes separators and case', () => {
        expect(formatTrackingNumber('  batch_001 ')).toBe('BATCH-00001')
        expect(formatTrackingNumber('BEEF 1')).toBe('BEEF-00001')
        expect(formatTrackingNumber('hlm 2026 1')).toBe('HLM-2026-00001')
    })

    it('preserves year segment and pads trailing sequence', () => {
        expect(formatTrackingNumber('HLM-2026-1')).toBe('HLM-2026-00001')
        expect(formatTrackingNumber('hlm20260001')).toBe('HLM-2026-00001')
    })

    it('does not over-pad long numeric segments', () => {
        expect(formatTrackingNumber('LOT-123456789')).toBe('LOT-123456789')
    })
})
