# FICO Phase 2 — Tax Codes Module: Final Report

**Status:** Implementation complete; all QA green. Migration validated against a fresh shadow DB but **not applied** to the local `agcerp` database (history divergence). No commit/push performed.

---

## 1. Scope delivered

Implemented only the **Tax Codes** module of FICO Phase 2: backend services/controller/DTOs/constants, decimal-safe calculation engine, audit history, effective-dated rates, tax calculation preview, company isolation, authorization, G/L mappings, and the full frontend (list, create/edit, details, rate history, audit history). Explicitly excluded: Journal Entries, tax returns/payments, automatic tax posting.

Phase 1 FICO entities (COA, Fiscal Year, G/L Accounts, Company Accounting Settings, Accounting Periods, Number Ranges) are reused — no new entities, no mock data; all pages call real APIs.

---

## 2. Migrations

| Migration | State | Verification |
|---|---|---|
| `20261106160000_fico_tax_codes` | Not applied locally | `prisma validate` ✅; `prisma migrate deploy` against a fresh shadow PostgreSQL DB applied **all** migrations cleanly including this one ✅ |

**Created tables (additive only, no existing table modified):**
- `fico_tax_codes` — company-specific tax code definitions
- `fico_tax_rates` — effective-dated tax rates
- `fico_tax_code_audit_logs` — append-only audit trail

**Fix made:** audit columns changed from `JSON` to `JSONB` to match Prisma's PostgreSQL `Json` mapping (consistent with Phase 1 audit tables that use `JSONB`).

**Migration status on local DB:** pending. `prisma migrate status` reports divergence: last common migration `20261106150000_fico_number_ranges`; several DB-side migrations absent locally (SD variant/snapshot/cart/catalog migrations listed twice). Applying requires a decision by the team because of the divergence. Reported as pending — not forced.

---

## 3. Relationships & data model

Schema at `backend/prisma/schema.prisma` lines 4468–4564.

| Table | FKs | Notes |
|---|---|---|
| `fico_tax_codes` | `companyId → companies.id` (Restrict); 5 G/L account FKs → `fico_gl_accounts.id` (Restrict) | `@@unique([companyId, code])` — unique code per company |
| `fico_tax_rates` | `taxCodeId → fico_tax_codes.id` (Restrict); `companyId → companies.id` (Restrict) | rate stored `Decimal(18,6)` |
| `fico_tax_code_audit_logs` | `taxCodeId → fico_tax_codes.id` (Restrict); `companyId → companies.id` (Restrict) | append-only, JSONB before/after |

Company isolation: every rate and audit log carries `companyId`; all service queries scope by `companyId` + access guard.

---

## 4. Services

**`FicoTaxCodeService`** (`backend/src/fico/fico-tax-code.service.ts`): CRUD + lifecycle + rates + audit + calculation orchestration.
- `create` — atomic: creates code as DRAFT, optionally creates first rate in same transaction, audits rate-create and code-create; activation validation runs if `status === 'ACTIVE'`.
- `update` — structural locking (category/type/calc-method/rate-unit immutable once rates exist or code active); activation validation runs on DRAFT→ACTIVE.
- `activate` / `deactivate` — single status transition (DRAFT↔ACTIVE↔INACTIVE); `assertActivatable` enforces mandatory G/L mappings, applicability selection, recoverability account, and usable rate for tax-bearing types; **rejects a future-only zero rate** for tax-bearing types.
- `remove` — always `BadRequestException` directing to deactivation; no physical deletion.
- `duplicate` — draft copy, optional rate inclusion, new code uniqueness checked.
- `list` / `summary` — date-derived effective status (not stored snapshot); status + effective-date filters combined via `AND` rather than overwriting.
- `getRates` / `createRate` / `updateRate` — overlap detection, auto-close previous open-ended rate when a later rate starts, rate immutability after start date (amount/unit/from-date cannot change), date-derived status filters (ACTIVE/SCHEDULED/EXPIRED/INACTIVE).
- `calculate` — read-only preview, calls `FicoTaxCalculationService`, no posting, no number-range consumption.
- `utilization` — rate count, audit-log count, active flag, `canDelete: false`.
- `history` — paginated audit log with search/action/actor/date-range filters, performer resolution, distinct actors.

**`FicoTaxCalculationService`** (`backend/src/fico/fico-tax-calculation.service.ts`): pure decimal-safe engine (`Prisma.Decimal`; no ordinary floats for money).
- Input accepted as number or decimal string (strings preferred to avoid precision loss before the engine).
- Supports `TAX_EXCLUSIVE`, `TAX_INCLUSIVE`, `NOT_APPLICABLE`; `PERCENTAGE` and `FIXED_AMOUNT` units; rounding `HALF_UP/HALF_DOWN/HALF_EVEN/UP/DOWN`; precision 0–10.
- Classifications: STANDARD / ZERO_RATED / EXEMPT / NON_TAXABLE / WITHHOLDING.
- Recoverable vs non-recoverable split; single `breakdown` component per code (document-level `PER_DOCUMENT` aggregation is a future source-document concern).
- Validation: non-negative amount, rate ≤ 100% for percentages, fixed tax ≤ gross for inclusive mode, zero-like types require 0% rate.

**Controller** `backend/src/fico/fico-tax-code.controller.ts` — `@Controller('fico')` under `/api/v1`:
- `GET tax-codes` (read), `GET tax-codes/summary` (read), `POST tax-codes` (create), `GET/PATCH/DELETE tax-codes/:id` (read/update/delete), `POST tax-codes/:id/activate|deactivate|duplicate` (update/create), `GET tax-codes/:id/history` (read), `GET/POST tax-codes/:taxCodeId/rates` (read/create), `PATCH tax-codes/:taxCodeId/rates/:rateId` (update), `POST tax-codes/calculate` (read), `GET tax-codes/:id/utilization` (read).
- All guarded with `@RequirePermission('fico.tax-codes', 'read|create|update|delete')`.

**DTOs** `backend/src/fico/dto/fico-phase1.dto.ts`: `FicoTaxCodeCreateDto`/`UpdateDto`/`ActivateDto`/`DeactivateDto`/`DuplicateDto`/`HistoryQueryDto`/`ListQueryDto`, `FicoTaxRateCreateDto`/`UpdateDto`/`QueryDto`, `FicoTaxCalculationDto`/`Result`. `taxJurisdiction` max length aligned to 128 in both create and update DTOs. Validation via `ValidationPipe({ whitelist: true, ... })`.

---

## 5. Calculation logic summary

- Engine never persists anything — MM/SD/AP/AR own calculation snapshots; this is configuration preview only.
- `dryRun: true` is honored; creates no posting or number-range consumption.
- Rate selection for a transaction date: non-INACTIVE rates whose window contains the date, newest `effectiveFrom` wins; zero-like types fall back to 0% rate.
- Rounding applied at configured precision/method; `PER_DOCUMENT` rounding level captured on the code but document-level aggregation deferred.

---

## 6. Frontend routes & components

| Route | Page | Purpose |
|---|---|---|
| `/modules/fico/tax-codes` | `TaxCodesPage.tsx` | List, summary cards, filters, pagination, duplicate/activate/deactivate dialogs, permission-gated actions |
| `/modules/fico/tax-codes/create` | `TaxCodeFormPage.tsx` | Create form: identity, classification, rounding, initial rate, recoverability, G/L mappings, remarks |
| `/modules/fico/tax-codes/[id]/edit` | `TaxCodeFormPage.tsx` | Edit form (same component, structural locking) |
| `/modules/fico/tax-codes/[id]/rates` | `TaxCodeRateHistoryPage.tsx` | Effective-dated rate management: add/edit/deactivate/reactivate, immutability handling |
| `/modules/fico/tax-codes/[id]/history` | `TaxCodeAuditHistoryPage.tsx` | Read-only audit table with filters (search/action/actor/date range), pagination, performer display, expandable before/after values |
| `/modules/fico/tax-codes/[id]` | `TaxCodeDetailsPage.tsx` | Details: utilization, summary cards, Overview/Rates/Mappings/Applicability/Preview tabs, actions |

**Components:**
- `taxCodeUi.tsx` — labels, options, status tones, formatting helpers, route helpers (`TAX_CODE_ROUTE`, `taxCodeHref`), audit action labels/tones.
- `TaxCalculationPreview.tsx` — calls backend `/calculate` only; displays result; no authoritative math in React.

**Reuse:** `FicoResponsiveTable` (wraps `ReceivingResponsiveTable`/`DataTable`), `StatCard`, `AdaptiveCard`, `FilterBar`, `FormDialog`, `ConfirmDialog`, `StatusBadge`, `PageContainer`, `PageHeader`, existing icons. `FormDialog` uses `confirmLoading` (not `loading`); `Button` variants limited to `solid|plain|default` (fixed `outline` → `default`).

**Sidebar** `src/configs/erp-modules.ts` lines 360–368: `tax-codes` entry under FICO, permission `fico.tax-codes`, icon `receipt`.

**Permissions** `usePermissions()` UI-only: `can('fico.tax-codes', 'read|create|update|delete')`; backend is the security boundary.

**API client** `src/modules/fico/services/ficoService.ts`: `ficoTaxService` extended with `summary`, `history`, `duplicate`, filters, `calculate`, `utilization`, rate operations.

**Types** `src/modules/fico/types.ts`: `FicoTaxCodeSummary`, `FicoTaxCodeHistoryItem`/`Response`/`Actor`, `FicoTaxRateListResponse`, `FicoTaxCalculationResult`, `FicoTaxCodeAuditEntry`.

---

## 7. Authorization & audit

- Backend `@RequirePermission('fico.tax-codes', ...)` on every endpoint; access asserted via `FicoCompanyAccessService.assertAccess(user, companyId)`.
- Catalog entry exists `backend/src/permissions/permissions.constants.ts` (`fico` group, `tax-codes` resource); default role `ADMIN` → `NO_DELETE` for fico (delete disabled by default).
- Audit: every mutating operation writes to `fico_tax_code_audit_logs` with `action` (from `FICO_TAX_AUDIT_ACTIONS`), `actorId`, `entityType`, `entityId`, `previousValues`/`newValues` (JSONB), `reason`, `metadata`, `createdAt`.
- Delete is blocked entirely; deactivation is the supported path (preserves audit/history).

---

## 8. QA results (all actually run)

| Check | Command | Result |
|---|---|---|
| Backend unit tests | `npx jest src/fico/fico-tax-calculation.service.spec.ts src/fico/fico-tax-code.service.spec.ts --runInBand --forceExit` | **28 passed** (26 original + 2 new: rate-list date-derived status filter; expired-filter excludes future-only codes; future-zero-rate activation rejection; non-numeric amount rejection) |
| Backend typecheck | `npx tsc --noEmit` | Clean for fico/tax files (only pre-existing unrelated `src/mm/outbound/outbound.spec.ts(486,17): TS1117`) |
| Backend ESLint | `npx eslint` on fico tax files | Passed (only inherited Next.js pages-directory config notice, unrelated to tax code) |
| Backend build | `npx nest build` | ✅ Succeeded |
| Prisma schema | `npx prisma validate` | ✅ Valid |
| Migration apply (shadow DB) | `npx prisma migrate deploy --shadow-database-url <shadow>` | ✅ All migrations incl. tax-codes applied cleanly (EXIT=0) |
| Frontend typecheck | `npx tsc --noEmit` | Clean for tax code files; remaining errors only in untouched MM/SD/storefront files |
| Frontend ESLint | `npx eslint` on all changed tax files | ✅ Passed (one unused-import warning fixed) |
| Frontend build | `npm run build` | ✅ Succeeded; all six tax-code routes appear in route manifest |

**Not run / remaining gaps:**
- End-to-end / API smoke test against the live local `agcerp` PostgreSQL DB — blocked by migration pending (history divergence).
- No commit or push performed.

---

## 9. Decisions recap

- Enhanced existing Tax Codes skeleton — no duplicate implementation.
- No new migration needed beyond the existing `20261106160000_fico_tax_codes` (JSON→JSONB fix applied in place).
- Single-rate `breakdown` retained; optional multi-component table skipped.
- Shared/global tax codes unsupported — company is required.
- Deletion blocked entirely; deactivation is the supported path.
- `Prisma.Decimal` for all monetary math; rate status derived from effective dates.
- Full-page routes: `create`, `[id]/edit`, `[id]/rates`, `[id]/history` (repointed to audit page).
- Create/update atomically create the first effective-dated rate.
- Rate overlap validation includes open-ended ranges; new later rate auto-closes previous open-ended rate and audits closure.
- Effective rates immutable in amount/unit/start date after start; new rate created to supersede.
- Zero-rated/exempt/non-taxable require 0% rates and may activate without a rate; tax-bearing types require a current/future non-zero rate.
- G/L mappings validated against company's assigned COA, active, posting account, account-type compatibility.
- Details page has no duplicate action (list page handles it) — avoids dead query-param link.
- Rate list filters compute date-derived effective status; activation rejects future-only zero rate for tax-bearing types.

---

## 10. Relevant files

Backend:
- `backend/src/fico/fico-tax-code.service.ts`
- `backend/src/fico/fico-tax-calculation.service.ts`
- `backend/src/fico/fico-tax-code.controller.ts`
- `backend/src/fico/dto/fico-phase1.dto.ts`
- `backend/src/fico/fico.constants.ts`
- `backend/src/fico/fico-tax-code.service.spec.ts` / `fico-tax-calculation.service.spec.ts`
- `backend/prisma/migrations/20261106160000_fico_tax_codes/migration.sql`
- `backend/prisma/schema.prisma` (lines 4468–4564)

Frontend:
- `src/modules/fico/services/ficoService.ts`
- `src/modules/fico/types.ts`
- `src/modules/fico/pages/TaxCodesPage.tsx`
- `src/modules/fico/pages/TaxCodeFormPage.tsx`
- `src/modules/fico/pages/TaxCodeDetailsPage.tsx`
- `src/modules/fico/pages/TaxCodeRateHistoryPage.tsx`
- `src/modules/fico/pages/TaxCodeAuditHistoryPage.tsx`
- `src/modules/fico/components/taxCodeUi.tsx`
- `src/modules/fico/components/TaxCalculationPreview.tsx`
- `src/app/(protected-pages)/modules/fico/tax-codes/{create,[id]/edit,[id]/rates,[id]/history}/page.tsx`
- `src/configs/erp-modules.ts` (lines 360–368)
- `backend/src/permissions/permissions.constants.ts` (fico group, tax-codes resource)
