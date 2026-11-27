# FICO Phase 03 — Enterprise Automatic Journal Posting

Single posting path: operational modules persist **`mm_accounting_events`** in the same DB transaction as inventory (MM), then FICO consumes events via `FicoAccountingConsumerService` and `FicoAccountingEventProcessorService` → `FicoJournalService.createFromAccountingEvent` / `postAutomaticJournal`.

## Durable events

Extended ledger columns (migration `20261126150000_fico_phase03_automatic_posting`) include posting purpose, business occurrence id, document date, valuation/dimension snapshots, correlation/causation ids, retry metadata, and `journalEntryIds` for multi-journal sources.

Stable idempotency keys: [`fico-accounting-idempotency.policy.ts`](../backend/src/fico/fico-accounting-idempotency.policy.ts) — `company:module:docType:docId:purpose:occurrence`.

## Recovery worker

[`FicoAccountingEventRecoveryService`](../backend/src/fico/fico-accounting-event-recovery.service.ts) polls `PENDING` and `RETRY_SCHEDULED` events (default 60s). Disable with `FICO_ACCOUNTING_RECOVERY_ENABLED=false`.

Stale `PROCESSING` leases revert via `recoverStaleProcessing()` (5 minute cutoff).

## Status machine

`PENDING` · `PROCESSING` · `CONSUMED` · `SKIPPED` · `FAILED` · `RETRY_SCHEDULED` · `DEAD_LETTER`

Structured errors: `FICO_ACCOUNTING_ERROR_CODES` in [`fico-accounting-event.constants.ts`](../backend/src/fico/fico-accounting-event.constants.ts).

## Invariants

- Posted journals + event `CONSUMED` commit atomically when `mmAccountingEventId` is supplied to `postAutomaticJournal`.
- Retries reuse the stored idempotency key; duplicate delivery returns the existing journal.
- Reversals remain source-driven via journal `reverseEntry` (original document preserved).