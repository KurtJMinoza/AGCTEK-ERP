import { BadRequestException } from '@nestjs/common'
import {
    FicoTaxCalculationService,
    taxClassificationOf,
    type TaxCalculationInput,
} from './fico-tax-calculation.service'

const service = new FicoTaxCalculationService()

function input(overrides: Partial<TaxCalculationInput> = {}): TaxCalculationInput {
    return {
        taxCodeId: 'tax-1',
        taxCode: 'VAT12',
        companyId: 'company-1',
        taxType: 'VAT',
        calculationMethod: 'TAX_EXCLUSIVE',
        roundingMethod: 'HALF_UP',
        roundingLevel: 'PER_LINE_ITEM',
        decimalPrecision: 2,
        isRecoverable: true,
        rate: { rate: '12', rateUnit: 'PERCENTAGE' },
        amount: '1000',
        transactionDate: '2026-01-15',
        transactionType: 'SALES',
        ...overrides,
    }
}

describe('FicoTaxCalculationService', () => {
    it('calculates tax-exclusive VAT without floating point drift', () => {
        const result = service.calculate(input())

        expect(result.netAmount).toBe(1000)
        expect(result.taxableBase).toBe(1000)
        expect(result.taxAmount).toBe(120)
        expect(result.grossAmount).toBe(1120)
        expect(result.recoverableTax).toBe(120)
        expect(result.nonRecoverableTax).toBe(0)
        expect(result.classification).toBe('STANDARD')
    })

    it('calculates tax-inclusive VAT from the gross amount', () => {
        const result = service.calculate(
            input({
                calculationMethod: 'TAX_INCLUSIVE',
                amount: '1120',
            }),
        )

        expect(result.netAmount).toBe(1000)
        expect(result.taxAmount).toBe(120)
        expect(result.grossAmount).toBe(1120)
    })

    it('keeps decimal precision for fractional amounts', () => {
        const result = service.calculate(
            input({
                amount: '1000.10',
                rate: { rate: '12', rateUnit: 'PERCENTAGE' },
            }),
        )

        expect(result.netAmount).toBe(1000.1)
        expect(result.taxAmount).toBe(120.01)
        expect(result.grossAmount).toBe(1120.11)
    })

    it('distinguishes zero-rated, exempt and non-taxable classifications', () => {
        const zeroRated = service.calculate(
            input({
                taxType: 'ZERO_RATED_TAX',
                rate: { rate: '0', rateUnit: 'PERCENTAGE' },
            }),
        )
        const exempt = service.calculate(
            input({
                taxType: 'EXEMPT_TAX',
                rate: { rate: '0', rateUnit: 'PERCENTAGE' },
            }),
        )
        const nonTaxable = service.calculate(
            input({
                taxType: 'NON_TAXABLE',
                rate: { rate: '0', rateUnit: 'PERCENTAGE' },
            }),
        )

        expect(zeroRated.classification).toBe('ZERO_RATED')
        expect(exempt.classification).toBe('EXEMPT')
        expect(nonTaxable.classification).toBe('NON_TAXABLE')
        expect(zeroRated.taxAmount).toBe(0)
        expect(exempt.taxAmount).toBe(0)
        expect(nonTaxable.taxAmount).toBe(0)
        expect(zeroRated.grossAmount).toBe(1000)
        expect(exempt.grossAmount).toBe(1000)
        expect(nonTaxable.grossAmount).toBe(1000)
    })

    it('supports fixed-amount tax in exclusive and inclusive modes', () => {
        const exclusive = service.calculate(
            input({
                rate: { rate: '50', rateUnit: 'FIXED_AMOUNT' },
            }),
        )
        const inclusive = service.calculate(
            input({
                calculationMethod: 'TAX_INCLUSIVE',
                amount: '1050',
                rate: { rate: '50', rateUnit: 'FIXED_AMOUNT' },
            }),
        )

        expect(exclusive.taxAmount).toBe(50)
        expect(exclusive.grossAmount).toBe(1050)
        expect(inclusive.netAmount).toBe(1000)
        expect(inclusive.taxAmount).toBe(50)
        expect(inclusive.grossAmount).toBe(1050)
    })

    it('applies each rounding method at the configured precision', () => {
        const base = input({
            amount: '0.05',
            rate: { rate: '10', rateUnit: 'PERCENTAGE' },
            decimalPrecision: 2,
        })

        expect(service.calculate({ ...base, roundingMethod: 'HALF_UP' }).taxAmount).toBe(0.01)
        expect(service.calculate({ ...base, roundingMethod: 'HALF_DOWN' }).taxAmount).toBe(0)
        expect(service.calculate({ ...base, roundingMethod: 'HALF_EVEN' }).taxAmount).toBe(0)
        expect(service.calculate({ ...base, roundingMethod: 'UP' }).taxAmount).toBe(0.01)
        expect(service.calculate({ ...base, roundingMethod: 'DOWN' }).taxAmount).toBe(0)
    })

    it('splits recoverable and non-recoverable tax', () => {
        const nonRecoverable = service.calculate(
            input({ isRecoverable: false }),
        )

        expect(nonRecoverable.recoverableTax).toBe(0)
        expect(nonRecoverable.nonRecoverableTax).toBe(120)
        expect(nonRecoverable.breakdown[0].nonRecoverableAmount).toBe(120)
    })

    it('classifies withholding tax separately', () => {
        const result = service.calculate(
            input({
                taxType: 'WITHHOLDING_TAX',
                calculationMethod: 'TAX_EXCLUSIVE',
                rate: { rate: '10', rateUnit: 'PERCENTAGE' },
            }),
        )

        expect(result.classification).toBe('WITHHOLDING')
        expect(result.taxType).toBe('WITHHOLDING_TAX')
        expect(result.taxAmount).toBe(100)
    })

    it('rejects negative amounts, rates above 100 and fixed tax above gross', () => {
        expect(() => service.calculate(input({ amount: '-1' }))).toThrow(
            BadRequestException,
        )
        expect(() =>
            service.calculate(input({ amount: 'not-a-number' })),
        ).toThrow(BadRequestException)
        expect(() =>
            service.calculate(
                input({ rate: { rate: '101', rateUnit: 'PERCENTAGE' } }),
            ),
        ).toThrow(BadRequestException)
        expect(() =>
            service.calculate(
                input({
                    calculationMethod: 'TAX_INCLUSIVE',
                    amount: '10',
                    rate: { rate: '20', rateUnit: 'FIXED_AMOUNT' },
                }),
            ),
        ).toThrow(BadRequestException)
    })

    it('maps tax types to calculation classifications', () => {
        expect(taxClassificationOf('ZERO_RATED_TAX')).toBe('ZERO_RATED')
        expect(taxClassificationOf('EXEMPT_TAX')).toBe('EXEMPT')
        expect(taxClassificationOf('NON_TAXABLE')).toBe('NON_TAXABLE')
        expect(taxClassificationOf('WITHHOLDING_TAX')).toBe('WITHHOLDING')
        expect(taxClassificationOf('VAT')).toBe('STANDARD')
    })
})
