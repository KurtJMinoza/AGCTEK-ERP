import { backorderReason, openQuantity } from './backorder-report.service'

describe('openQuantity', () => {
    it.each([
        [
            'nothing reserved',
            {
                quantity: 5,
                baseQuantity: 5,
                reservedQuantity: 0,
                issuedQuantity: 0,
            },
            5,
        ],
        [
            'partly reserved',
            {
                quantity: 5,
                baseQuantity: 5,
                reservedQuantity: 2,
                issuedQuantity: 0,
            },
            3,
        ],
        [
            'reserved + issued cover it',
            {
                quantity: 5,
                baseQuantity: 5,
                reservedQuantity: 3,
                issuedQuantity: 2,
            },
            0,
        ],
        [
            'over-covered',
            {
                quantity: 5,
                baseQuantity: 5,
                reservedQuantity: 9,
                issuedQuantity: 0,
            },
            0,
        ],
        [
            'no base quantity uses sales qty',
            {
                quantity: 4,
                baseQuantity: null,
                reservedQuantity: 1,
                issuedQuantity: 0,
            },
            3,
        ],
        // 2 boxes = 24 pcs base; 12 pcs reserved → 1 box still open.
        [
            'converts base shortfall to sales UOM',
            {
                quantity: 2,
                baseQuantity: 24,
                reservedQuantity: 12,
                issuedQuantity: 0,
            },
            1,
        ],
    ])('%s', (_label, line, expected) => {
        expect(openQuantity(line)).toBe(expected)
    })
})

describe('backorderReason', () => {
    it('flags unmapped SKUs first, then MM shortages', () => {
        expect(
            backorderReason({ integrationStatus: 'SHORT', materialId: null }),
        ).toBe('NO_MATERIAL')
        expect(
            backorderReason({ integrationStatus: 'SHORT', materialId: 'm1' }),
        ).toBe('STOCK_SHORTAGE')
        expect(
            backorderReason({ integrationStatus: 'OPEN', materialId: 'm1' }),
        ).toBe('AWAITING_RESERVATION')
    })
})
