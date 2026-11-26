# FICO G/L Account Master Data

Status: **partial / in progress** (Nov 2026). Complements [FICO_PHASE1_ARCHITECTURE.md](./FICO_PHASE1_ARCHITECTURE.md).

## Architecture overview

| Layer | Owner | Notes |
| --- | --- | --- |
| Shared account master | `FicoGlAccount` + chart / group | One code per COA |
| Company controls | `FicoCompanyGlAccount` | `postingEnabled`, `manualPostingBlocked`, effective dates |
| Posting engine | `FicoJournalService` | Unchanged sole GL writer |
| Validation | `FicoPostingValidationService` | Company + account + period |
| Audit | `FicoAuditService` → `fico_accounting_audit_logs` | Append-only |

MM still uses `fico_mm_account_mappings`; centralized `fico_account_determination_rules` is not yet wired into automatic journal resolution.

## Problems addressed (recent)

- G/L page mixed master data, MM mappings, and accounting events → **split routes** (Phase 1 nav).
- Weak delete / where-used → **dependency scan** + server-side eligibility.
- Company assignment UX → **company settings** dialog + APIs.
- No optimistic concurrency on edit → **`expectedUpdatedAt`** on PATCH.
- Posted-history structural edits → **backend guards** on type/group/currency/recon/open item.

## API surface (`/api/v1/fico`)

### Core (existing, extended)

| Method | Path | Permission (action) |
| --- | --- | --- |
| GET | `/gl-accounts` | `fico.gl-accounts` read — optional `page`, `pageSize`, `sortBy`, `sortDir` |
| GET | `/gl-accounts/summary` | read |
| POST | `/gl-accounts` | create |
| GET | `/gl-accounts/:id` | read |
| PATCH | `/gl-accounts/:id` | update (`expectedUpdatedAt` optional) |
| DELETE | `/gl-accounts/:id` | delete — only when **inactive** + eligibility pass |

### Aliases / additions (Phase 17)

| Method | Path | Maps to |
| --- | --- | --- |
| GET | `/gl-accounts/:id/where-used` | usage + dependency categories |
| GET | `/gl-accounts/:id/deletion-eligibility` | `deletionEligibility` |
| GET | `/gl-accounts/:id/dependencies` | same payload as where-used summary |
| GET | `/gl-accounts/:id/change-history` | paginated `FicoGlAccount` audit |
| GET | `/gl-accounts/:id/line-items` | posted journal lines (paginated, company scoped) |
| GET | `/gl-accounts/:id/balances` | posted debit/credit aggregates |
| GET | `/gl-accounts/:id/company-settings` | assignment context |
| POST | `/gl-accounts/:id/duplicate` | copy master (new code) |
| POST | `/gl-accounts/import/validate` | `importAccounts` `dryRun: true` |
| POST | `/gl-accounts/import/confirm` | `importAccounts` `dryRun: false` |
| POST | `/gl-accounts/:id/activate` | status ACTIVE + audit |
| POST | `/gl-accounts/:id/deactivate` | status INACTIVE + audit |
| POST | `/gl-accounts/:id/reactivate` | ACTIVE from INACTIVE + audit |
| POST | `/gl-accounts/:id/companies/:companyId/block-posting` | `postingEnabled: false` + audit |
| POST | `/gl-accounts/:id/companies/:companyId/unblock-posting` | `postingEnabled: true` + audit |
| PUT | `/gl-accounts/:id/companies/:companyId` | assignment upsert (existing) |

### Deferred (explicit 400)

| Method | Path | Reason |
| --- | --- | --- |
| POST | `/gl-accounts/:id/submit` | No G/L draft/approval schema yet |
| POST | `/gl-accounts/:id/approve` | Same |
| POST | `/gl-accounts/:id/reject` | Same |

Legacy routes kept: `GET .../usage`, `POST .../import`, `GET .../dependencies`.

## Suggested permission mapping (Phase 18)

Granular codes from the implementation prompt map to existing resources **without breaking roles**:

| Suggested | Existing |
| --- | --- |
| `fico.gl-accounts.view` | `fico.gl-accounts` **read** |
| `fico.gl-accounts.create` | **create** |
| `fico.gl-accounts.edit` | **update** |
| `fico.gl-accounts.delete-draft` | **delete** (inactive + eligible only) |
| `fico.gl-accounts.import` | **create** on import endpoints |
| `fico.gl-accounts.export` | **read** (CSV export is client-side today) |
| `fico.gl-accounts.view-usage` | **read** on where-used / line-items |
| `fico.gl-accounts.view-history` | **read** on change-history |
| `fico.gl-accounts.company-assignment` | **update** on company PUT / block / unblock |
| `fico.gl-accounts.block-posting` | **update** on block-posting |
| `fico.gl-accounts.activate` / `deactivate` | **update** on lifecycle POSTs |

Company scope: `FicoCompanyAccessService` on assignments, balances, line-items, dependencies (hidden counts for out-of-scope journals).

## Audit actions (new)

- `GL_ACCOUNT_ACTIVATE`, `GL_ACCOUNT_DEACTIVATE`, `GL_ACCOUNT_REACTIVATE`
- `COMPANY_GL_POSTING_BLOCKED`, `COMPANY_GL_POSTING_UNBLOCKED`

## Database

No destructive migration in this tranche. Master lifecycle **DRAFT / PENDING_APPROVAL** not in `fico_gl_accounts.status` enum yet (values remain `ACTIVE` / `INACTIVE`).

## Testing (executed in dev)

```bash
cd backend
npx nest build
npx jest src/fico/fico-gl-accounts.service.spec.ts --runInBand --forceExit --no-coverage
```

## Known limitations

- No maker-checker approval on G/L accounts.
- No per-company currency/recon/open-item columns (master + assignment flags only).
- No dedicated GL line-items / trial balance **pages** (API + dialogs only).
- MM journal path still uses legacy mappings.
- React Query not adopted in FICO; list state is local `useState` + `load()` callback.
- Submit/approve/reject endpoints return **400** until lifecycle schema exists.

## Remaining dependencies

- Prisma migration for G/L approval lifecycle (optional).
- Wire `FicoAccountResolutionService` into `FicoJournalService` for MM.
- Dedicated frontend routes for balances and line-items drill-down.