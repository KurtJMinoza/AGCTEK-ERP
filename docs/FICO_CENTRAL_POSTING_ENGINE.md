# FICO central posting engine

## Ownership

All committed financial documents flow through `FicoFinancialPostingEngine` and `FicoJournalService.postAutomaticJournal` / manual post paths. G/L balances and trial balance read **posted** journal lines only (`ledgerCommittedJournalWhere`).

## Currency (Phase 1)

- **Functional currency only**: `FicoCompanyAccountingSettings.baseCurrency` is the sole supported posting currency (`FICO_MULTI_CURRENCY_ACCOUNTING_ENABLED = false`).
- `assertPostingCurrencyPolicy` rejects foreign header currency and mixed line currencies at posting validation.
- Trial balance / account balance aggregation rejects committed journals with **more than one** `currencyCode` (`FICO_MIXED_CURRENCY_LEDGER`).

### Future multi-currency (not implemented)

Reserved concepts: transaction currency, company currency, exchange rate/date, parallel amounts, rounding, FX gain/loss, revaluation. Amounts in different currencies must **not** be summed until that design is implemented.

## Line integrity

`assertBalancedLines` enforces:

- Minimum two lines
- No zero lines
- No dual-sided lines
- Non-negative amounts (unless company allows negatives in validation layer)
- Debit = credit

## Open items

Posted G/L lines are **not** open items. AP/AR open-item clearing, partial clearing, and residual items are **not** implemented — no open-item inquiry UI.

## Reversals

Reversal documents use the journal reversal workflow; originals remain in ledger history with status `REVERSED` where applicable (`FICO_LEDGER_COMMITTED_STATUSES`).

## Idempotency

Automatic postings (MM, SD/POS, opening balance, year-end close) use unique `idempotencyKey` on `FicoJournalEntry`.

## Related docs

- [FICO_PHASE1_ARCHITECTURE.md](./FICO_PHASE1_ARCHITECTURE.md)
- [FICO_GL_JOURNAL_IMPLEMENTATION_ASSESSMENT.md](./FICO_GL_JOURNAL_IMPLEMENTATION_ASSESSMENT.md)