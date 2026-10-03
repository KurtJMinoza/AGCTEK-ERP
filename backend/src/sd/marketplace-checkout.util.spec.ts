import { groupLinesByDivision } from './marketplace-checkout.util'

describe('groupLinesByDivision', () => {
    it('creates one group per division, keeping cart order', () => {
        const lines = [
            { divisionId: 'DIV_RETAIL', sku: 'VIT-1' },
            { divisionId: 'DIV_LPG', sku: 'LPG-11' },
            { divisionId: 'DIV_RETAIL', sku: 'BAG-1' },
            { divisionId: 'DIV_APPLIANCES', sku: 'MW-20' },
        ]

        const groups = groupLinesByDivision(lines)

        expect([...groups.keys()]).toEqual([
            'DIV_RETAIL',
            'DIV_LPG',
            'DIV_APPLIANCES',
        ])
        expect(groups.get('DIV_RETAIL')?.map((l) => l.sku)).toEqual([
            'VIT-1',
            'BAG-1',
        ])
        expect(groups.get('DIV_LPG')?.map((l) => l.sku)).toEqual(['LPG-11'])
        expect(groups.get('DIV_APPLIANCES')?.map((l) => l.sku)).toEqual([
            'MW-20',
        ])
    })

    it('returns a single group for a single-store cart', () => {
        const groups = groupLinesByDivision([
            { divisionId: 'DIV_LPG', sku: 'A' },
            { divisionId: 'DIV_LPG', sku: 'B' },
        ])
        expect(groups.size).toBe(1)
        expect(groups.get('DIV_LPG')).toHaveLength(2)
    })

    it('returns no groups for an empty cart', () => {
        expect(groupLinesByDivision([]).size).toBe(0)
    })
})
