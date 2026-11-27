import {
    AWIC_MERCHANDISING_GL,
    merchandisingGlCodesForCategory,
} from './fico-merchandising-account-map'

describe('merchandisingGlCodesForCategory', () => {
    it('maps CAPS to cap-specific revenue, COGS, and inventory codes', () => {
        expect(merchandisingGlCodesForCategory('CAPS')).toEqual(
            AWIC_MERCHANDISING_GL.CAPS,
        )
        expect(AWIC_MERCHANDISING_GL.CAPS).toEqual({
            revenue: '4011',
            cogs: '5011',
            inventory: '1311',
        })
    })

    it('maps FOOD and supplements to food supplement triplet', () => {
        expect(merchandisingGlCodesForCategory('SUPPLEMENTS')?.revenue).toBe(
            '4004',
        )
    })
})