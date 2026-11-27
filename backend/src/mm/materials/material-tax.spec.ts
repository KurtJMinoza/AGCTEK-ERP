import {
    assertTaxCodeCompatible,
    buildMaterialTaxProjection,
    compatibleClassifications,
    materialTaxChanged,
    materialTaxSnapshot,
    resolveCurrentTaxRate,
} from './material-tax'

const TODAY = new Date('2026-11-12T00:00:00.000Z')

const code = (overrides: Record<string, unknown> = {}) =>
    ({
        id: 'code-1',
        companyId: 'company-1',
        code: 'VAT12',
        name: 'VAT 12%',
        taxType: 'VAT',
        status: 'ACTIVE',
        taxRates: [
            {
                rate: 12,
                rateUnit: 'PERCENTAGE',
                effectiveFrom: '2026-01-01',
                effectiveTo: null,
                status: 'ACTIVE',
            },
        ],
        ...overrides,
    }) as any

const config = (overrides: Record<string, unknown> = {}) => ({
    taxClassification: 'VATABLE',
    taxCodeId: 'code-1',
    priceTaxTreatment: 'VAT_INCLUSIVE',
    taxStatus: 'ACTIVE',
    taxEffectiveFrom: '2026-01-01',
    taxEffectiveTo: null,
    taxDescription: null,
    ...overrides,
})

describe('material tax classification', () => {
    it('maps VATable, VAT Exempt and Zero-Rated to compatible FICO tax types', () => {
        expect(compatibleClassifications('VAT')).toEqual(['VATABLE'])
        expect(compatibleClassifications('PERCENTAGE_TAX')).toEqual([
            'VATABLE',
        ])
        expect(compatibleClassifications('EXEMPT_TAX')).toEqual(['VAT_EXEMPT'])
        expect(compatibleClassifications('NON_TAXABLE')).toEqual([
            'VAT_EXEMPT',
        ])
        expect(compatibleClassifications('ZERO_RATED_TAX')).toEqual([
            'ZERO_RATED',
        ])
    })

    it('rejects an incompatible classification/tax code pair', () => {
        expect(() =>
            assertTaxCodeCompatible('VATABLE', 'EXEMPT_TAX'),
        ).toThrow('not compatible')
        expect(() =>
            assertTaxCodeCompatible('ZERO_RATED', 'VAT'),
        ).toThrow('not compatible')
        expect(() =>
            assertTaxCodeCompatible('VAT_EXEMPT', 'EXEMPT_TAX'),
        ).not.toThrow()
    })

    it('reads the current FICO rate and treats zero-like codes as 0%', () => {
        expect(resolveCurrentTaxRate(code(), TODAY)).toMatchObject({
            rate: 12,
            rateUnit: 'PERCENTAGE',
        })
        expect(
            resolveCurrentTaxRate(
                code({ taxType: 'EXEMPT_TAX', taxRates: [] }),
                TODAY,
            ),
        ).toMatchObject({ rate: 0 })
    })

    it('reports a VAT code without a current rate as missing, never 0%', () => {
        expect(
            resolveCurrentTaxRate(code({ taxRates: [] }), TODAY),
        ).toBeNull()
    })

    it('projects a fully configured, active material as ready for sale', () => {
        const tax = buildMaterialTaxProjection(
            {
                ...config(),
                taxCode: code(),
            },
            TODAY,
        )
        expect(tax).toMatchObject({
            configured: true,
            readyForSale: true,
            classificationLabel: 'VATable',
            taxCode: 'VAT12',
            taxRate: 12,
            effectiveStatus: 'ACTIVE',
        })
        expect(tax.warnings).toEqual([])
    })

    it('never assumes VATable for an existing unconfigured material', () => {
        const tax = buildMaterialTaxProjection({}, TODAY)
        expect(tax).toMatchObject({
            configured: false,
            readyForSale: false,
            classification: null,
            effectiveStatus: 'NOT_CONFIGURED',
        })
        expect(tax.warnings).toContain('Tax Classification Not Configured')
    })

    it('marks an expired configuration as expired and not sale-ready', () => {
        const tax = buildMaterialTaxProjection(
            {
                ...config({ taxEffectiveTo: '2026-06-30' }),
                taxCode: code(),
            },
            TODAY,
        )
        expect(tax.effectiveStatus).toBe('EXPIRED')
        expect(tax.readyForSale).toBe(false)
        expect(tax.warnings).toContain('Tax configuration has expired')
    })

    it('marks an inactive tax code as not sale-ready', () => {
        const tax = buildMaterialTaxProjection(
            {
                ...config(),
                taxCode: code({ status: 'INACTIVE' }),
            },
            TODAY,
        )
        expect(tax.readyForSale).toBe(false)
        expect(tax.warnings.join(' ')).toContain('is INACTIVE')
    })

    it('snapshots the rate at change time so later FICO edits cannot rewrite history', () => {
        const before = materialTaxSnapshot(
            { ...config(), taxCode: code() },
            TODAY,
        )
        expect(before).toMatchObject({
            taxClassification: 'VATABLE',
            taxCodeValue: 'VAT12',
            taxRate: 12,
        })

        const afterFicoChange = materialTaxSnapshot(
            {
                ...config(),
                taxCode: code({
                    taxRates: [
                        {
                            rate: 15,
                            rateUnit: 'PERCENTAGE',
                            effectiveFrom: '2026-11-12',
                            effectiveTo: null,
                            status: 'ACTIVE',
                        },
                    ],
                }),
            },
            TODAY,
        )
        expect(afterFicoChange.taxRate).toBe(15)
        expect(before.taxRate).toBe(12)
    })

    it('detects tax changes and ignores unchanged dates in different formats', () => {
        expect(materialTaxChanged(config(), config())).toBe(false)
        expect(
            materialTaxChanged(
                config(),
                config({ taxEffectiveFrom: new Date('2026-01-01') }),
            ),
        ).toBe(false)
        expect(
            materialTaxChanged(config(), config({ taxStatus: 'INACTIVE' })),
        ).toBe(true)
    })
})
