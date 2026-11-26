import { Decimal } from '@prisma/client/runtime/library'
import { FicoFinancialPostingEngine } from './fico-financial-posting.engine'
import type { FinancialPostingLineInput } from './fico-financial-posting.types'

function line(
    partial: Partial<FinancialPostingLineInput> & { glAccountId: string },
): FinancialPostingLineInput {
    return {
        debit: new Decimal(0),
        credit: new Decimal(0),
        ...partial,
    }
}

describe('FicoFinancialPostingEngine.assertBalancedLines', () => {
    const engine = new FicoFinancialPostingEngine({} as never, {} as never)

    it('accepts a balanced two-line journal', () => {
        expect(
            engine.assertBalancedLines([
                line({ glAccountId: 'a1', debit: new Decimal(100) }),
                line({ glAccountId: 'a2', credit: new Decimal(100) }),
            ]).totalDebit.toString(),
        ).toBe('100')
    })

    it('rejects unbalanced journals', () => {
        expect(() =>
            engine.assertBalancedLines([
                line({ glAccountId: 'a1', debit: new Decimal(100) }),
                line({ glAccountId: 'a2', credit: new Decimal(90) }),
            ]),
        ).toThrow(/unbalanced/i)
    })

    it('rejects fewer than two lines', () => {
        expect(() =>
            engine.assertBalancedLines([
                line({ glAccountId: 'a1', debit: new Decimal(100) }),
            ]),
        ).toThrow(/At least two accounting lines/)
    })

    it('rejects zero-value lines', () => {
        expect(() =>
            engine.assertBalancedLines([
                line({ glAccountId: 'a1', debit: new Decimal(0), credit: new Decimal(0) }),
                line({ glAccountId: 'a2', credit: new Decimal(100) }),
            ]),
        ).toThrow(/Zero-value/)
    })

    it('rejects dual-sided lines', () => {
        expect(() =>
            engine.assertBalancedLines([
                line({
                    glAccountId: 'a1',
                    debit: new Decimal(50),
                    credit: new Decimal(50),
                }),
                line({ glAccountId: 'a2', credit: new Decimal(100) }),
            ]),
        ).toThrow(/both debit and credit/)
    })

    it('rejects negative debit amounts', () => {
        expect(() =>
            engine.assertBalancedLines([
                line({ glAccountId: 'a1', debit: new Decimal(-1) }),
                line({ glAccountId: 'a2', credit: new Decimal(1) }),
            ]),
        ).toThrow(/Negative/)
    })
})