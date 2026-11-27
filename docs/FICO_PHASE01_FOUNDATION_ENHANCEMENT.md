# FICO Phase 01 — Financial Accounting Foundation Enhancement

Baseline: `FICO_GL_JOURNAL_IMPLEMENTATION_ASSESSMENT.md`,
`FICO_GL_ACCOUNT_MASTER_DATA_ARCHITECTURE.md`, and the existing Phase 1 FICO
implementation. This phase extends working behavior; no posting engine,
ledger policy, or document flow was replaced.

## A. Company accounting configuration

`FicoCompanyAccountingSettings` now stores:

- `postingPrecision` (0–4, default 4) — maximum accepted amount decimals.
- `defaultFinancialDimensions` (JSON) — company defaults for financial dimensions.
- `reconciliationPolicy` (`BLOCK_MANUAL` default / `ALLOW_MANUAL`).

`FicoPostingValidationService.validate` blocks postings when the company is not
`ACTIVE`, has no active chart of accounts, fiscal calendar, or posting-period
variant. Inactive/incomplete companies cannot post through manual, automatic,
or reversal paths that call this service.

## B. G/L account master

`FicoGlAccount` gains `financialStatementMapping`, `taxCategory`,
`requiresBranch`, `requiresCostCenter`, `requiresProfitCenter`. Existing
code/name/type/group/currency/recon/open-item/manual+automatic flags and
effective company assignments remain authoritative.

`FicoApReconciliationGuardService` now:

- blocks direct manual posting to **AP and AR** reconciliation accounts by default;
- honors the company `reconciliationPolicy`;
- preserves AP-subledger postings (`subledgerPosting: 'AP'`) and automatic AR postings.

Changing required-dimension flags after journal lines exist is rejected.
All master changes remain append-only through `FicoAuditService`.

## C. Inquiry vs configuration

`/modules/fico/general-ledger` stays an accounting inquiry and transaction
reporting page. Configuration remains in `/modules/fico/chart-of-accounts` and
`/modules/fico/gl-accounts`. No second configuration interface was added.

## D. Journal document controls

`FicoPostingValidationService` is now the single validation entry point for
manual create, manual edit, approval-less post, automatic post, and reversal.
It enforces:

- balanced debit/credit;
- company ownership and active accounting config;
- account postability, currency restriction, company assignment, effective dates;
- currency precision and company posting precision;
- posting-period authorization (closed/locked/future rejected);
- restricted periods only for roles with `fico.period-reopen` update grant;
- required branch/cost-center/profit-center dimensions per line;
- optional `documentType` validation against company document-type master;
- optional source document reference and header/line text requirements.

Journal lines persist `branchId`, `costCenterId`, `profitCenterId`. Headers
persist `documentType`, `sourceDocumentType`, `sourceDocumentId`. Automatic
journals still go through `FicoJournalService.postAutomaticJournal` — no bypass.

## E. Immutability

Posted and reversed journal headers and lines stay immutable via the database
triggers in `20261023120000_fico_phase1_foundation`. Corrections use
`FicoJournalService.reverseEntry`, which keeps the original document and its
audit trail. Reversal now re-checks company/period/currency controls without
re-validating account master flags (so a later master change cannot block a
required correction).

## F. Database

Migration: [`20261126120000_fico_phase01_foundation_enhancement`](../backend/prisma/migrations/20261126120000_fico_phase01_foundation_enhancement/migration.sql)
— additive columns only. Applied to the local `agcerp` database and marked as
applied. Generated Prisma client updated.

## Validation run

```bash
cd backend
npm run build
npx jest src/fico --runInBand --forceExit --no-coverage
cd ..
npm run build
```

Result: backend build OK; FICO suite **31 suites / 246 tests passed**;
frontend build OK.

## Known limits

- `defaultFinancialDimensions` is stored and returned but not yet used to
  pre-fill journal lines in the UI.
- Restricted-period override uses the existing `fico.period-reopen` grant; no
  new permission resource was added.
- `postingPrecision` defaults to 4 (DB decimal scale) to avoid rejecting
  existing automatic tax/fx calculations. Set it to 2 for strict 2-decimal
  companies.
