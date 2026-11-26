import {
    manualJournalReversalPermitted,
    resolveJournalPostingOrigin,
    resolveJournalReversalStatus,
} from './fico-journal-origin.policy'

describe('resolveJournalPostingOrigin', () => {
    it('classifies manual entries without source module', () => {
        expect(resolveJournalPostingOrigin({ documentType: 'JOURNAL' })).toBe('MANUAL')
    })

    it('classifies automatic when sourceModule is set', () => {
        expect(
            resolveJournalPostingOrigin({ sourceModule: 'MM', documentType: 'MM_GR' }),
        ).toBe('AUTOMATIC')
    })

    it('classifies reversal documents', () => {
        expect(
            resolveJournalPostingOrigin({
                reversalOfId: 'j-1',
                sourceModule: 'SD',
                documentType: 'SD_REVERSAL',
            }),
        ).toBe('REVERSAL')
    })
})

describe('resolveJournalReversalStatus', () => {
    it('marks reversal children', () => {
        expect(
            resolveJournalReversalStatus({
                status: 'POSTED',
                reversalOfId: 'orig',
            }),
        ).toBe('IS_REVERSAL')
    })
})

describe('manualJournalReversalPermitted', () => {
    it('blocks integrated module journals', () => {
        expect(manualJournalReversalPermitted('MM')).toBe(false)
        expect(manualJournalReversalPermitted('AP')).toBe(false)
    })

    it('allows manual journals', () => {
        expect(manualJournalReversalPermitted(null)).toBe(true)
    })
})