import { BadRequestException } from '@nestjs/common'
import { JournalEntryService } from './journal-entry.service'

describe('JournalEntryService accounting rules', () => {
    const service = new JournalEntryService({} as never, {} as never, {} as never, {} as never)
    const validate = (lines: Array<{ debit: number; credit: number }>) =>
        (service as unknown as { validateLines(value: typeof lines): void }).validateLines(lines)

    it('accepts a balanced journal with one-sided lines', () => {
        expect(() => validate([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }])).not.toThrow()
    })

    it('rejects an unbalanced journal', () => {
        expect(() => validate([{ debit: 100, credit: 0 }, { debit: 0, credit: 90 }])).toThrow(BadRequestException)
    })

    it('rejects a line containing both debit and credit', () => {
        expect(() => validate([{ debit: 100, credit: 10 }, { debit: 0, credit: 90 }])).toThrow(BadRequestException)
    })

    it('rejects a zero-value journal', () => {
        expect(() => validate([{ debit: 0, credit: 0 }, { debit: 0, credit: 0 }])).toThrow(BadRequestException)
    })
})
