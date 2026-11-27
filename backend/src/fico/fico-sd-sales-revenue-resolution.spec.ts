import {
    matchRevenueGlAccountCodeFromCoa,
    type SalesRevenueMaterialContext,
} from './fico-sd-sales-revenue-resolution'

const revenueAccounts = [
    { accountCode: '4004', accountName: 'SALES-FOOD SUPPLEMENTS' },
    { accountCode: '4008', accountName: 'SALES- PERFUMES' },
    { accountCode: '4009', accountName: 'SALES- SHIRTS' },
    { accountCode: '4011', accountName: 'SALES- CAP' },
]

describe('matchRevenueGlAccountCodeFromCoa', () => {
    it('maps CAPS category to SALES-CAP revenue account', () => {
        const material: SalesRevenueMaterialContext = {
            materialId: 'mat-1',
            materialCode: 'MAT-000105',
            valuationClassId: null,
            materialTypeCode: 'MERCHANDISE',
            materialCategoryCode: 'CAPS',
            materialCategoryName: 'Caps',
        }
        expect(
            matchRevenueGlAccountCodeFromCoa(material, revenueAccounts),
        ).toBe('4011')
    })

    it('maps perfume valuation via explicit category token', () => {
        const material: SalesRevenueMaterialContext = {
            materialId: 'mat-2',
            materialCode: 'MAT-000108',
            valuationClassId: null,
            materialTypeCode: 'MERCHANDISE',
            materialCategoryCode: 'PERFUMES',
            materialCategoryName: 'Perfumes',
        }
        expect(
            matchRevenueGlAccountCodeFromCoa(material, revenueAccounts),
        ).toBe('4008')
    })

    it('maps CONSUMABLES to food/supplement sales revenue (not miscellaneous 63xx)', () => {
        const withMiscIncome = [
            ...revenueAccounts,
            {
                accountCode: '6308',
                accountName: 'SHOPEE - BUYING FEE AND REBATES',
            },
        ]
        const material: SalesRevenueMaterialContext = {
            materialId: 'mat-tuna',
            materialCode: 'MAT-000713',
            valuationClassId: null,
            materialTypeCode: 'MERCHANDISE',
            materialCategoryCode: 'CONSUMABLES',
            materialCategoryName: 'Consumables',
        }
        expect(
            matchRevenueGlAccountCodeFromCoa(material, withMiscIncome),
        ).toBe('4004')
    })
})