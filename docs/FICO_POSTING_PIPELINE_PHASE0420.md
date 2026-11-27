# Phase 04.20 — Central financial posting pipeline

```text
Operational source transaction
  → durable MmAccountingEvent (idempotencyKey)
  → FicoAccountingConsumerService / processor claim
  → FicoJournalService.createFromAccountingEvent
       ├─ SD/POS: FicoSdPostingService → resolveDetermination per transaction key
       └─ MM: FicoAccountDeterminationService → FicoAccountResolutionService
  → FicoPostingValidationService (accounts + period)
  → FicoFinancialPostingEngine (document number, atomic journal + lines)
  → General ledger (POSTED)
```

## Safeguards

- No journal without full debit/credit resolution (`FicoAccountingDeterminationException`).
- No header-only or partial line posts (`postAutomaticJournal` validates balance).
- Idempotency on `fico_journal_entries.idempotencyKey` and event key.
- Reversals copy **original journal lines** (`reverseEntry`) — never re-resolve determination.
- Failed determination: event stays **PENDING** (retryable); no journal row created.

## Event outcomes

| Outcome | Event status |
| --- | --- |
| Posted | `CONSUMED` + `journalEntryId` |
| Determination/config error | `PENDING` + `lastErrorCode=DETERMINATION` |
| Max attempts | `FAILED` |
| Non-financial | `SKIPPED` |