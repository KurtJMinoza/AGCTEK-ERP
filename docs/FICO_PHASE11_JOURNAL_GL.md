# FICO Phase 11 — Journal Entries & General Ledger

Single authoritative **Journal Entries** register for manual and automatic postings, with enriched list/detail APIs and GL inquiry aligned to posted journal lines.

## Journal origin

| Origin | Rule |
| --- | --- |
| `MANUAL` | No `sourceModule` |
| `AUTOMATIC` | `sourceModule` set, not a reversal |
| `REVERSAL` | `reversalOfId` or reversal document type |
| `SYSTEM_ADJUSTMENT` | Opening / period-close document types |

## APIs

- `GET /api/v1/fico/journal-entries` — pagination, sort, filters (`postingOrigin`, `sourceModule`, `sourceDocumentNumber`, `customerId`, `branchId`, …), list fields include debit/credit totals and partner refs.
- `GET /api/v1/fico/journal-entries/:id` — header enrichment, capabilities, tax lines, accounting event, **document flow** nodes, line dimensions.
- `GET /api/v1/fico/gl-accounts/:id/line-items` — `sortDir`, `sourceModule`, `includeRunningBalance`.
- `GET /api/v1/fico/gl-accounts/:id/balances` — optional `dateFrom` / `dateTo` for opening, period movement, closing.

## UI

- `JournalEntriesWorkbench` / `JournalEntryDetailView` (no duplicate automatic-journal module).
- Posted automatic journals: read-only; reverse only when `capabilities.canReverse` (integrated MM/SD/AP/AR use source workflows).
- `GeneralLedgerPage` — period balances, source module filter, ascending running balance.

## Acceptance mapping

- **A–E:** Origin classification, unified masterlist, detail workbench, navigable flow, immutable posted automatic journals.
- **F:** GL from committed journal lines only; running balance on ascending inquiry.
- **G:** Manual draft/post workflows unchanged; automatic journals visible on **Automatic** tab and in **All**.