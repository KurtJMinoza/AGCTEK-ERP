import type { Prisma } from '@prisma/client'

/**
 * Committed ledger documents: amounts were posted (`postedAt` set) and the
 * document was never a draft-only shell. Includes POSTED originals and
 * REVERSED originals so net balances stay correct when a reversal exists.
 */
import { FICO_JOURNAL_LEDGER_STATUSES } from './fico.constants'

export const FICO_LEDGER_COMMITTED_STATUSES = FICO_JOURNAL_LEDGER_STATUSES

export type FicoLedgerCommittedStatus =
    (typeof FICO_LEDGER_COMMITTED_STATUSES)[number]

/** Prisma filter for journal headers that contribute to G/L balances and trial balance. */
export function ledgerCommittedJournalWhere(
    extra?: Prisma.FicoJournalEntryWhereInput,
): Prisma.FicoJournalEntryWhereInput {
    return {
        postedAt: { not: null },
        status: { in: [...FICO_LEDGER_COMMITTED_STATUSES] },
        ...extra,
    }
}

/** Nested filter for journal line queries (`journalEntry` relation). */
export function ledgerCommittedJournalEntryRelationWhere(
    extra?: Prisma.FicoJournalEntryWhereInput,
): Prisma.FicoJournalEntryWhereInput {
    return ledgerCommittedJournalWhere(extra)
}