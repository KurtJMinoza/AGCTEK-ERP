# FICO General Ledger & Journal — Implementation Assessment

**Date:** 2026-11-24  
**Scope:** Central posting engine, ledger policy, MM/POS integration, UI workbench, trial balance, integrity tooling.

## Verified defects (pre-change)

| ID | Finding | Severity |
|----|---------|----------|
| D1 | MM fallback created `POSTED` headers with lines only in `metadata` | Critical |
| D2 | G/L balances filtered `status: POSTED` only — reversed originals dropped from history | Critical |
| D3 | POS listener wrote journals via direct Prisma | High |
| D4 | MM used legacy mappings only; rules engine not on posting path | High |
| D5 | Auto journals: `approvalStatus` could remain `DRAFT` while `status` `POSTED` | Medium |
| D6 | Many auto postings lacked `documentNumber` | Medium |
| D7 | Reversal endpoint used `fico.journal-entries` update, not `fico.journal-reversal` | Medium |
| D8 | No Journal Entry UI; trial balance API/UI missing | High |
| D9 | Manual API allowed `autoPost` client bypass | Medium |

## Posting bypass inventory

| Location | Pattern | Action |
|----------|---------|--------|
| `fico-journal.service.ts` | Authoritative | Enhance |
| `pos-revenue-posting.listener.ts` | Direct `ficoJournalEntry.create` | Route through `FicoJournalService.postAutomaticJournal` |
| (none other) | — | — |

## Target state (this implementation)

1. **`fico-ledger-policy.ts`** — committed ledger = `postedAt != null` and `status ∈ {POSTED, REVERSED}`.
2. **`FicoJournalService.postAutomaticJournal`** — single automatic commit path with document numbers and aligned statuses.
3. **MM** — no header-only fallback; failures mark `MmAccountingEvent` FAILED.
4. **Account determination** — try centralized rules per MM line context; legacy mappings when no matching ACTIVE rule (logged compatibility).
5. **POS** — company default G/L assignments + payment-method account codes (no literal account numbers in code).
6. **Trial balance** — `FicoGeneralLedgerService` + Phase 1 API + UI route.
7. **Journal workbench** — list/create/workflow UI wired to existing APIs.
8. **Integrity** — `FicoJournalIntegrityService` dry-run report (non-destructive).

## Out of scope (explicit)

- Payroll, HRIS, full AP/AR/AA/CO modules.
- Destructive repair of historical posted amounts.
- Automatic reconstruction of missing lines from current rules.

## Validation checklist

- [x] `npx nest build` (backend)
- [x] `fico-journal.service.spec.ts` + approval spec
- [ ] `fico-gl-accounts.service.spec.ts` (ledger filters — not re-run this pass)
- [x] `npm run build` (frontend)
- [ ] Manual E2E: create manual JE → approve → post → trial balance

## Phase 04–06 (this pass)

- Posting status `CANCELLED`; ledger still keyed on `postedAt` + `POSTED`/`REVERSED` (not approval).
- Approval `NOT_REQUIRED` for automatic postings; manual post keeps `APPROVED` while `status` → `POSTED`.
- Draft edit/cancel/withdraw, revision bump on post-approval edits, submit requires balanced lines.
- Reversal: stable idempotency key, optional posting date, period check, integrated-source guard (MM/SD/PP).
- Numbering: `FicoDocumentNumberingService` → `{TYPE}-{fiscalYear}-{seq}` (e.g. `JE-2026-000001`).
- Migration: [20261124120000_fico_journal_lifecycle](C:/Users/AGCTek/Desktop/starter/backend/prisma/migrations/20261124120000_fico_journal_lifecycle/migration.sql).

## Remaining gaps (honest)

- Journal workbench: create uses raw G/L IDs (no account picker yet); no `cancelDraft` / `updateDraft` / `simulatePosting` APIs.
- Dedicated **General Ledger inquiry** page (account balances hub) — trial balance + existing G/L line-item dialogs cover partial need.
- Line-level `accountDeterminationRuleId` trace field (schema migration not added).
- Integrity tool: dry-run + optional `approvalStatus` repair only — no automated reconstruction of header-only historical journals.
- Full POS account selection via centralized rules (uses company default accounts + payment-method codes).