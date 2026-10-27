# FICO Phase 1 — Foundation, Company Settings, COA, G/L, Posting Periods, MM Integration

Status: **implemented and verified** (backend + frontend, database-backed).

This document is the authoritative reference for the FICO Phase 1 delivery inside the
existing AGCTEK ERP. It follows `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md`: FICO owns the
financial effect, MM owns physical stock, and the two are bridged by exactly one
synchronous posting engine.

---

## 1. Ownership boundaries

| Concern | Owner | Implementation |
| --- | --- | --- |
| Physical stock changes | MM | `backend/src/mm/inventory/inventory-posting.service.ts` (unchanged) |
| Automatic account resolution | FICO | `backend/src/fico/fico-account-determination.service.ts` |
| Journal posting / reversal | FICO | `backend/src/fico/fico-journal.service.ts` |
| Period control | FICO | `backend/src/fico/financial-period.service.ts` |
| Company accounting configuration | FICO | `backend/src/fico/fico-company-settings.service.ts` |
| MM → FICO bridge | MM→FICO | `backend/src/mm/integration/fico/mm-fico-posting.service.ts` |

Rules enforced by code:

* One accounting configuration per company (`FicoCompanyAccountingSettings.companyId` unique).
* Every accounting document carries `companyId`; all FICO reads are company-scoped and
  authorized by `FicoCompanyAccessService` (company membership required, `super_admin` bypass).
* Only `ACTIVE` companies get automatic accounting. `DRAFT`/`INACTIVE` block postings;
  companies without settings keep the legacy MM behaviour (no accounting document).
* No G/L account is ever auto-created from a material, SKU, or variant name. Accounts are
  resolved through **explicit** transaction-key mappings only.

## 2. Data model (additive only)

Migration: `backend/prisma/migrations/20261023120000_fico_phase1_foundation/migration.sql`
(applied with `prisma migrate deploy`; no table was dropped or renamed).

New tables (Prisma models in `backend/prisma/schema.prisma`):

* `fico_company_accounting_settings`, `fico_chart_of_accounts`, `fico_gl_account_groups`,
  `fico_gl_accounts`, `fico_company_gl_accounts`
* `fico_fiscal_year_variants`, `fico_posting_period_variants`, `fico_financial_periods`,
  `fico_posting_period_controls`, `fico_posting_period_audit_logs`
* `fico_account_determination_profiles`, `fico_mm_account_mappings`, `fico_transaction_keys`
* `fico_journal_entries` (extended), `fico_journal_entry_lines`, `fico_document_sequences`
* `fico_accounting_audit_logs`, `fico_historical_backposting_runs`

Database guarantees:

| Rule | Mechanism |
| --- | --- |
| One settings row per company | unique index on `companyId` |
| Unique COA code | unique index on `fico_chart_of_accounts.code` |
| Unique account code per COA | unique index (`chartOfAccountsId`,`accountCode`) |
| Unique company/account assignment | unique index (`companyId`,`glAccountId`) |
| Unique group code per COA | unique index (`chartOfAccountsId`,`code`) |
| Unique journal document number per company | unique index (`companyId`,`documentNumber`) |
| Unique posting idempotency | unique `idempotencyKey` + unique `sourcePostingKey` + unique `mmAccountingEventId` |
| One accounting event per source identity | unique `mm_accounting_events.idempotencyKey` |
| Posted documents are immutable | trigger `fico_journal_entries_immutable` |
| Posted journal lines are immutable | trigger `fico_journal_entry_lines_immutable` |
| Audit trail is append-only | triggers `fico_accounting_audit_logs_append_only`, `fico_posting_period_audit_logs_append_only` |
| Money precision | `numeric(18,4)` (never float) |

## 3. Company accounting settings

* Lifecycle: `DRAFT` → `ACTIVE` → `INACTIVE`.
* `DRAFT` is editable and never posts. `ACTIVE` requires a validation pass
  (`POST /fico/company-settings/validate`) before activation.
* Philippine defaults are **suggested**, not forced: `PHP`, `Asia/Manila`, `PH`,
  accrual, calendar year Jan 1 – Dec 31, 12 normal periods, up to 4 special periods.
* Structural fields (base currency, country, timezone, accounting method, COA, fiscal and
  posting period variants) can only change while the configuration is `DRAFT`, and never
  after accounting documents exist.
* Every settings change is audited (`COMPANY_SETTINGS_CREATE/UPDATE/ACTIVATE/DEACTIVATE`).

## 4. Chart of accounts and G/L accounts

* Hierarchical groups with circular-parent prevention, unique group code per COA, and
  expandable/searchable/filterable UI.
* G/L account types `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE` with a normal-balance
  classification (crediting an asset stays legal).
* Per-account controls: posting account, manual posting, automatic posting, reconciliation
  account + type, open-item management, currency restriction, status.
* Company-level assignment (`FicoCompanyGlAccount`): posting enabled, manual blocked,
  effective dates. Inactive/blocked/company-mismatched accounts are rejected at posting time.
* Account codes are stored as strings so leading zeros survive.
* A chart can be duplicated (groups + accounts) into a `DRAFT` copy for review.
* Account usage is tracked: the G/L list returns journal-line, debit-mapping and
  credit-mapping counts, and the Usage column drills through to the journal lines
  of that account (`/modules/fico/journal-details?glAccountId=…`). Deleting an
  account with usage is refused — deactivate it instead.

## 5. Fiscal years and posting periods

* Variants support calendar and non-calendar fiscal years (`startMonth`/`startDay`).
* Generation is calendar-aware (leap years included), non-overlapping, idempotent for the
  same calendar, and refuses to overwrite a different existing calendar.
* Special periods are year-end adjustments (max 4), not extra calendar months.
* Period statuses: `FUTURE`, `OPEN`, `RESTRICTED`, `CLOSED`, `LOCKED`.
  Transitions are validated against `FICO_STATUS_TRANSITIONS`.
* Closing is transactional and checks for incomplete/unbalanced documents. Open GR/IR
  balances never block closing on their own. The check runs inside the closing
  transaction, after the `FOR UPDATE` period lock, so a concurrent posting cannot
  slip in between the check and the status write:
  - a period holding documents that are not `POSTED`/`REVERSED`/`LEGACY` is refused
    (incomplete documents must be posted or reversed first);
  - a period holding a `POSTED` document whose lines do not balance is refused and
    the offending document numbers are listed.
  - `LEGACY` (header-only) documents are excluded from both checks.
* Reopen requires a reason, actor and timestamp, and is audited. Locked periods need the
  separate privileged unlock action (`fico.period-unlock`).
* Closed-period rejection message (exact):
  `Accounting posting is not allowed. Fiscal period 09/2026 is closed for AGCTEK Corporation. Please contact an authorized Finance Administrator.`

## 6. Automatic account determination

Transaction keys: `GR_IR`, `GI_COGS`, `GI_EXPENSE`, `SUPPLIER_INVOICE`,
`SUPPLIER_INVOICE_VAT`, `INVENTORY_SHRINKAGE`, `INVENTORY_INCREASE_ADJ`, `PRICE_VARIANCE`,
`LANDED_COST`.

Starter mappings seeded for AGCTEK (`PH_MM_STARTER` COA, `DEFAULT` profile):

| Key | Debit | Credit |
| --- | --- | --- |
| GR_IR | 120100 Merchandise Inventory | 210200 GR/IR Clearing |
| GI_COGS | 510100 Cost of Goods Sold | 120100 Merchandise Inventory |
| GI_EXPENSE | 510400 Operating Expense | 120100 Merchandise Inventory |
| SUPPLIER_INVOICE | 210200 GR/IR Clearing | 210100 Accounts Payable |
| SUPPLIER_INVOICE_VAT | 130100 Input VAT | 210100 Accounts Payable |
| INVENTORY_SHRINKAGE | 520100 Inventory Shrinkage | 120100 Merchandise Inventory |
| INVENTORY_INCREASE_ADJ | 120100 Merchandise Inventory | 310200 Inventory Increase Offset |
| PRICE_VARIANCE | 510500 Purchase Price Variance | 210200 GR/IR Clearing |
| LANDED_COST | 120100 Merchandise Inventory | 210100 Accounts Payable |

Resolution rejects missing mappings, inactive accounts, non-posting accounts, blocked
company assignments and wrong-company accounts. There is **no** silent fallback.

## 7. Journal posting engine

`FicoJournalService` is the single posting engine (manual + automatic + reversal).

* Double entry enforced by `assertValidJournalLines` (≥2 lines, debit XOR credit, no
  negative amounts, debits = credits, total > 0).
* Journals are inserted as `DRAFT` and flipped to `POSTED` in the same transaction (the
  database immutability trigger forbids line inserts on a posted document).
* Idempotency is enforced by unique `idempotencyKey` / `sourcePostingKey` /
  `mmAccountingEventId` columns; a repeated request returns the existing document.
* Document numbers come from `fico_document_sequences` (per company, document type, year).
* Posted documents cannot be edited or deleted; corrections are reversals that reference
  the original in both directions (`reversalOfId` / `reversedBy`).
* Audit entry `JOURNAL_POST` / `JOURNAL_REVERSE` stores actor, company, entity, values and reason.

## 8. MM integration

`MmFicoPostingService` is the only bridge:

1. `prepare()` resolves mappings, validates posting accounts and checks the fiscal period
   **before** stock is touched. No settings ⇒ legacy behaviour; `DRAFT`/`INACTIVE` ⇒ blocked.
2. The MM service posts stock through `InventoryPostingService`.
3. The journal is posted with the value the inventory engine actually booked
   (valuation-aligned, so the G/L and the sub-ledger agree).
4. If the journal fails, the stock transactions are compensated (reversed) and the
   accounting event is marked `FAILED`.
5. `MmAccountingEvent` links the business document to the accounting document in both
   directions (`mmAccountingEventId` ↔ journal).

Coverage:

| MM document | Key | Result |
| --- | --- | --- |
| Goods Receipt | `GR_IR` | Dr 120100 / Cr 210200 at the booked inventory value |
| Goods Issue (sales) | `GI_COGS` | Dr 510100 / Cr 120100 |
| Goods Issue (other) | `GI_EXPENSE` | Dr 510400 / Cr 120100 |
| Inventory adjustment (loss) | `INVENTORY_SHRINKAGE` | Dr 520100 / Cr 120100 |
| Inventory adjustment (gain) | `INVENTORY_INCREASE_ADJ` | Dr 120100 / Cr 310200 |
| Supplier invoice (three-way match) | `SUPPLIER_INVOICE` (+ optional `SUPPLIER_INVOICE_VAT`) | Dr 210200 / Cr 210100 (+ Dr 130100) |

Reversals of GR/GI/adjustment create the accounting reversal first, then unwind stock, and
close any pending accounting event so the legacy consumer cannot post a second document.

## 9. API (existing convention `/api/v1/fico`)

| Area | Endpoints |
| --- | --- |
| Company settings | `GET/POST/PUT /fico/company-settings`, `GET /fico/company-settings/companies`, `GET /fico/company-settings/defaults`, `POST /fico/company-settings/validate|activate|deactivate` |
| Chart of accounts | `GET/POST /fico/chart-of-accounts`, `GET/PATCH/DELETE /fico/chart-of-accounts/:id`, `POST /fico/chart-of-accounts/:id/duplicate`, `GET /fico/chart-of-accounts/:id/groups`, `POST/PATCH/DELETE /fico/chart-of-accounts/groups...` |
| G/L accounts | `GET/POST /fico/gl-accounts`, `GET/PATCH/DELETE /fico/gl-accounts/:id`, `PUT/DELETE /fico/gl-accounts/:id/companies...` |
| Fiscal years | `GET /fico/fiscal-years`, `GET /fico/fiscal-years/variants`, `POST /fico/fiscal-years/generate` |
| Posting periods | `GET /fico/posting-periods`, `GET /fico/posting-periods/resolve`, `POST /fico/posting-periods/:id/open|restrict|close|lock|reopen|unlock` |
| Account determination | `GET /fico/account-determination/transaction-keys|profiles|mappings`, `POST/PATCH/DELETE .../mappings` |
| General ledger | `GET /fico/journals`, `GET /fico/journals/:id`, `POST /fico/journals`, `POST /fico/journals/:id/reverse`, `GET /fico/journal-lines`, `GET /fico/reports/trial-balance`, `GET /fico/overview` |
| Audit | `GET /fico/audit` |
| Dashboard | `GET /fico/dashboard` |
| Legacy (kept) | `GET/POST /fico/periods`, `POST /fico/periods/status`, `GET /fico/reconciliation` |

All routes require an authenticated user, a permission resource, and (for company data)
company membership.

## 10. Frontend

`src/modules/fico/` (services, types, shared helpers, pages) with thin route re-exports in
`src/app/(protected-pages)/modules/fico/*`.

| Route | Page |
| --- | --- |
| `/modules/fico/overview` | Finance Overview (live metrics, warnings, recent activity) |
| `/modules/fico/company-settings` | Company table + configuration form, validate, activate/deactivate |
| `/modules/fico/chart-of-accounts` | COA list, duplicate, activate/deactivate, assign, group tree |
| `/modules/fico/gl-accounts` | G/L master with posting controls and company assignment |
| `/modules/fico/fiscal-years` | Variants + period generation |
| `/modules/fico/fiscal-periods` | Period table, open/restrict/close/lock/reopen, history |
| `/modules/fico/account-determination` | Transaction keys, profiles, mappings |
| `/modules/fico/journal-entries` | Journal list, manual posting, reversal, document detail |
| `/modules/fico/journal-details` | Line-level drill-down |
| `/modules/fico/account-balances` | Trial balance / account balances |
| `/modules/fico/audit-log` | Accounting audit trail |

Navigation lives in `src/configs/erp-modules.ts` (FICO module block).

## 11. Permissions

Catalog resources (`backend/src/permissions/permissions.constants.ts`): `fico.company-settings`,
`fico.chart-of-accounts`, `fico.gl-accounts`, `fico.periods`, `fico.period-reopen`,
`fico.period-unlock`, `fico.account-determination`, `fico.journal-entries`,
`fico.journal-reversal`, `fico.audit`, `fico.overview` (plus the pre-existing
`fico.configuration`, `fico.reports`, `fico.cost-centers`, `fico.profit-centers`,
`fico.accounts-payable`, `fico.accounts-receivable`).

Seeded role templates (`backend/prisma/seed-fico-phase1.ts`, idempotent):
`finance_administrator` (full), `accountant` (read/create/update, audit read-only),
`auditor` (read-only), `warehouse_user` (no finance grants).

## 12. Seeding and backup

* `backend/prisma/seed-fico-phase1.ts` — idempotent seed: fiscal/posting variants,
  transaction keys, valuation classes, `PH_MM_STARTER` COA (12 accounts), AGCTEK settings,
  `DEFAULT` determination profile + mappings, company G/L assignments, role templates.
* `backend/prisma/backups/fico-pre-phase1-2026-10-23T03-05-52-311Z.json` — logical
  (JSON) backup taken before the migration, because `pg_dump`/`psql` are unavailable here.

## 13. How to verify locally

```bash
# backend
cd backend
npx prisma migrate deploy            # apply the FICO migration
npx prisma generate
npx nest build
npx pm2 restart erp-backend
npx jest src/fico --runInBand        # FICO unit tests
npx jest src/mm/architecture         # MM architecture guardrails
npm run test:pg                      # FICO concurrency suite (real PostgreSQL)

# frontend
cd ..
npm run build
npx pm2 restart erp-frontend         # production preview on :3020
npm run dev                          # development on :3010
```

`npm run test:pg` runs every `*.pg-spec.ts`, including
`backend/src/fico/fico-posting.pg-spec.ts`, which proves against a real database
that concurrent postings with one idempotency key create exactly one document,
that document numbers never collide, that a period close is serialized against a
concurrent posting, that an unbalanced document blocks closing, and that a user
without company membership cannot post.

Then open `/modules/fico` in the ERP navigation and select company `AGCTEK Corporation`.

## 13.1 Agent configuration (Cursor)

Phase 1 is developed with dedicated Cursor subagents and shared project rules:

| File | Role |
| --- | --- |
| `.cursor/agents/erp-fico-architect.md` | Master architect — owns design, reviews every component |
| `.cursor/agents/fico-implementation-coordinator.md` | Sequences the phases and owns the critical-path file table |
| `.cursor/agents/fico-company-accounting.md` | Company Accounting Settings |
| `.cursor/agents/fico-chart-of-accounts.md` | Chart of Accounts |
| `.cursor/agents/fico-general-ledger.md` | G/L Account Master |
| `.cursor/agents/fico-fiscal-calendar.md` | Fiscal Year Configuration |
| `.cursor/agents/fico-posting-periods.md` | Posting Period Management |
| `.cursor/agents/fico-posting-engine.md` | Accounting Posting Engine |
| `.cursor/agents/fico-mm-account-determination.md` | Automatic Account Determination |
| `.cursor/agents/fico-mm-integration.md` | MM ↔ FICO integration |
| `.cursor/agents/fico-frontend.md` | All Phase 1 Finance screens |
| `.cursor/agents/fico-database.md` | Schema, migrations, seeds |
| `.cursor/agents/fico-security-audit.md` | Permissions, company access, audit trail |
| `.cursor/agents/fico-qa.md` | Validation and regression |
| `.cursor/rules/fico-architecture.mdc` | Shared rules binding every FICO agent |
| `.cursor/rules/fico-testing.mdc` | Validation commands and the FICO test matrix |

These agents are development-time assistants. They do not run autonomously against
live company finances, and no agent may modify production accounting data without
the documented approval flow.

## 14. Known limitations (Phase 1)

* Single currency per company: no FX engine, no exchange rates. Foreign-currency source
  documents are rejected instead of being converted.
* No VAT calculation engine: `SUPPLIER_INVOICE_VAT` uses the tax amount supplied on the
  invoice line; no statutory computation.
* Purchase price variance is recorded by the valuation engine but is not yet posted to the
  G/L automatically (the `PRICE_VARIANCE` mapping exists for a later phase).
* No AP/AR sub-ledger documents, no asset accounting, no cost-centre allocation.
* Historical back-posting is modelled (`FicoHistoricalBackpostingRun`) but disabled by
  default and requires explicit approval.
* Journal documents are stored with a `LEGACY` marker for the 57 pre-existing header-only
  journals; they are excluded from the trial balance and from G/L balances.
