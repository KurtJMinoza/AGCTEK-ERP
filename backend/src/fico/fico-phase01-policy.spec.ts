import { BadRequestException } from '@nestjs/common'
import {
    assertDocumentTypeControl,
    assertPostingPrecision,
    assertRequiredDimensions,
    decimalPlaces,
} from './fico-phase01-policy'

describe('Phase 01 posting policy', () => {
    it('counts decimal places including exponent notation', () => {
        expect(decimalPlaces(12.345)).toBe(3)
        expect(decimalPlaces(1)).toBe(0)
        expect(decimalPlaces(1e-7)).toBe(7)
    })

    it('rejects amounts beyond company posting precision', () => {
        expect(() => assertPostingPrecision([10.12], 2)).not.toThrow()
        expect(() => assertPostingPrecision([10.123], 2)).toThrow(
            BadRequestException,
        )
        expect(() => assertPostingPrecision([10], 5)).toThrow(/between 0 and 4/)
    })

    it('enforces required financial dimensions per account', () => {
        const account = {
            requiresBranch: true,
            requiresCostCenter: true,
            requiresProfitCenter: false,
        }
        expect(() =>
            assertRequiredDimensions(
                { branchId: 'B1', costCenterId: 'CC1' },
                account,
                '210000',
            ),
        ).not.toThrow()
        expect(() =>
            assertRequiredDimensions({ branchId: 'B1' }, account, '210000'),
        ).toThrow(/cost center/)
        expect(() =>
            assertRequiredDimensions({}, account, '210000'),
        ).toThrow(/branch/)
    })

    it('enforces document type controls', () => {
        const base = {
            documentType: 'JE',
            companyLabel: 'AGCTEK',
            lines: [{ debitAmount: 10, creditAmount: 10, description: 'x' }],
        }
        expect(() =>
            assertDocumentTypeControl({
                ...base,
                documentTypeRow: null,
                accountTypes: [],
            }),
        ).toThrow(/not configured/)
        expect(() =>
            assertDocumentTypeControl({
                ...base,
                documentTypeRow: {
                    code: 'JE',
                    status: 'ACTIVE',
                    allowedAccountTypes: ['ASSET'],
                    debitPostingAllowed: true,
                    creditPostingAllowed: true,
                    negativePostingAllowed: false,
                    referenceRequired: true,
                    headerTextRequired: false,
                    lineTextRequired: false,
                },
                accountTypes: ['EXPENSE'],
            }),
        ).toThrow(/does not allow account type/)
        expect(() =>
            assertDocumentTypeControl({
                ...base,
                documentTypeRow: {
                    code: 'JE',
                    status: 'ACTIVE',
                    allowedAccountTypes: [],
                    debitPostingAllowed: true,
                    creditPostingAllowed: true,
                    negativePostingAllowed: false,
                    referenceRequired: true,
                    headerTextRequired: false,
                    lineTextRequired: false,
                },
                accountTypes: [],
            }),
        ).toThrow(/source document reference/)
    })
})
