import { buildJournalListWhere } from './fico-journal-list.builder'

describe('buildJournalListWhere', () => {
    it('filters by supplierId when provided', () => {
        const where = buildJournalListWhere({
            companyId: 'co-1',
            supplierId: 'sup-1',
        }) as Record<string, unknown>
        expect(where.companyId).toBe('co-1')
        expect(where.supplierId).toBe('sup-1')
    })

    it('omits supplierId when not provided', () => {
        const where = buildJournalListWhere({ companyId: 'co-1' }) as Record<
            string,
            unknown
        >
        expect(where.supplierId).toBeUndefined()
    })

    it('maps MANUAL sourceModule to null/empty source journals', () => {
        const where = buildJournalListWhere({
            companyId: 'co-1',
            sourceModule: 'MANUAL',
        }) as Record<string, unknown>
        expect(where.sourceModule).toBeUndefined()
        expect(where.AND).toEqual(
            expect.arrayContaining([
                { OR: [{ sourceModule: null }, { sourceModule: '' }] },
            ]),
        )
    })

    it('uppercases concrete sourceModule filters', () => {
        const where = buildJournalListWhere({
            companyId: 'co-1',
            sourceModule: 'sd',
        }) as Record<string, unknown>
        expect(where.sourceModule).toBe('SD')
    })
})
