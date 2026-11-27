import { buildJournalListWhere } from './fico-journal-list.builder'

describe('buildJournalListWhere', () => {
    it('filters by supplierId when provided', () => {
        const where = buildJournalListWhere({
            companyId: 'co-1',
            supplierId: 'sup-1',
        })
        expect(where.companyId).toBe('co-1')
        expect(where.supplierId).toBe('sup-1')
    })

    it('omits supplierId when not provided', () => {
        const where = buildJournalListWhere({ companyId: 'co-1' })
        expect(where.supplierId).toBeUndefined()
    })
})
