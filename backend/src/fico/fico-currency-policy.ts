import { FICO_FINANCIAL_ERROR_CODES } from './fico.constants'
import { FicoFinancialException } from './fico-financial-exception'

/**
 * Phase 1: single functional currency per company. Multi-currency fields on journal
 * headers/lines are reserved for a future design (transaction vs company amounts, FX gain/loss).
 */
export const FICO_MULTI_CURRENCY_ACCOUNTING_ENABLED = false

export type PostingCurrencyPolicyInput = {
    companyCurrency: string
    documentCurrency: string
    lineCurrencies?: string[]
}

export function assertPostingCurrencyPolicy(input: PostingCurrencyPolicyInput) {
    const company = input.companyCurrency.trim().toUpperCase()
    const document = input.documentCurrency.trim().toUpperCase()

    if (!company || company.length !== 3) {
        throw new FicoFinancialException(
            FICO_FINANCIAL_ERROR_CODES.FICO_UNSUPPORTED_CURRENCY,
            'Company base currency is not configured for posting.',
        )
    }

    if (FICO_MULTI_CURRENCY_ACCOUNTING_ENABLED) {
        return { companyCurrency: company, documentCurrency: document }
    }

    if (document !== company) {
        throw new FicoFinancialException(
            FICO_FINANCIAL_ERROR_CODES.FICO_UNSUPPORTED_CURRENCY,
            `Posting currency ${document} is not supported. This company uses functional currency ${company} only.`,
            { companyCurrency: company, documentCurrency: document },
        )
    }

    const lineCurrencies = (input.lineCurrencies ?? [])
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)

    const distinct = new Set(lineCurrencies)
    if (distinct.size > 1) {
        throw new FicoFinancialException(
            FICO_FINANCIAL_ERROR_CODES.FICO_UNSUPPORTED_CURRENCY,
            'Mixed transaction currencies on one journal are not supported.',
            { currencies: [...distinct] },
        )
    }
    if (distinct.size === 1) {
        const only = [...distinct][0]!
        if (only !== company) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_UNSUPPORTED_CURRENCY,
                `Line currency ${only} does not match company currency ${company}.`,
            )
        }
    }

    return { companyCurrency: company, documentCurrency: document }
}