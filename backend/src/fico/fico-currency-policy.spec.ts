import { assertPostingCurrencyPolicy } from './fico-currency-policy'
import { FicoFinancialException } from './fico-financial-exception'

describe('assertPostingCurrencyPolicy', () => {
    it('allows matching company and document currency', () => {
        expect(
            assertPostingCurrencyPolicy({
                companyCurrency: 'PHP',
                documentCurrency: 'php',
            }),
        ).toEqual({ companyCurrency: 'PHP', documentCurrency: 'PHP' })
    })

    it('rejects foreign document currency when multi-currency is disabled', () => {
        expect(() =>
            assertPostingCurrencyPolicy({
                companyCurrency: 'PHP',
                documentCurrency: 'USD',
            }),
        ).toThrow(FicoFinancialException)
    })

    it('rejects mixed line currencies', () => {
        expect(() =>
            assertPostingCurrencyPolicy({
                companyCurrency: 'PHP',
                documentCurrency: 'PHP',
                lineCurrencies: ['PHP', 'USD'],
            }),
        ).toThrow(/Mixed transaction currencies/)
    })
})