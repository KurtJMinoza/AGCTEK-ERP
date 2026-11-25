# Phase 04 — Centralized Account Determination

## 04.01 Architecture assessment (repository state)

### Authoritative components

| Component | Role | Path |
| --- | --- | --- |
| **FicoAccountResolutionService** | Central rule matching, priority, dimensions | `backend/src/fico/fico-account-resolution.service.ts` |
| **FicoAccountDeterminationService** | MM dispatch adapter: central rules first, legacy `fico_mm_account_mappings` fallback | `backend/src/fico/fico-account-determination.service.ts` |
| **FicoAccountMappingService** | Legacy mapping CRUD | `backend/src/fico/fico-account-mapping.service.ts` |
| **FicoAccountDeterminationRulesService** | Rule lifecycle (draft → active) | `backend/src/fico/fico-account-determination-rules.service.ts` |
| **FicoSdPostingService** | SD/POS flat line composition | `backend/src/fico/fico-sd-posting.service.ts` |
| **FicoJournalService** | Single posting engine | `backend/src/fico/fico-journal.service.ts` |
| **FicoPostingValidationService** | Account + period eligibility | `backend/src/fico/fico-posting-validation.service.ts` |

### Data stores

- **Central:** `fico_account_determination_rules` + `fico_account_determination_lines`
- **Legacy (MM):** `fico_mm_account_mappings` + `fico_account_determination_profiles` + `fico_transaction_keys`
- **Catalog (Phase 04):** extended `fico_transaction_keys` metadata + `fico-transaction-key.catalog.ts`

### Verified gaps (Nov 2026)

| ID | Issue | Status in Phase 04 |
| --- | --- | --- |
| G1 | Dual MM configuration (rules vs mappings) | **Mitigated:** central rules preferred; legacy fallback retained with `legacyMappingUsed` audit metadata |
| G2 | MM central path used only first debit/credit line | **Fixed:** full rule lines for 2-line rules; explicit error for 3+ lines until operational split |
| G3 | Profile required even when central rules exist | **Unchanged (P1):** profile still required for MM gate; relax in follow-up |
| G5 | SD silent fallback to company defaults | **P1:** logging added; defaults remain last resort |
| G6 | `SdCustomerCollection` not implemented | **P1 backlog** |
| G9 | Seeded rules often DRAFT | **Ops:** activate rules in UI or run catalog sync |

### Resolution path inventory

```text
MM event → FicoAccountingConsumerService → FicoJournalService.createFromAccountingEvent
  ├─ SD/POS payload → FicoSdPostingService.resolveFlatLines → postAutomaticJournal
  └─ MM payload → FicoAccountDeterminationService.resolveMmPosting
        ├─ FicoAccountResolutionService.resolve (ACTIVE rule)
        └─ fico_mm_account_mappings (fallback)

Manual journal → FicoJournalService (no determination)

POS listener → mm_accounting_events (no direct journal insert)
```

### Migration strategy

- **Additive only:** extend `fico_transaction_keys` with catalog metadata; upsert keys via `FicoTransactionKeyService.syncCatalog()`.
- **No** data purge; **no** destructive changes to posted journals.
- Legacy mappings remain until central rules are ACTIVE for each company/key/dimension signature.

## 04.02 Target architecture

Operational modules emit **financial posting requests** with transaction context and amounts only. **FicoAccountResolutionService** resolves accounts. **FicoPostingValidationService** validates. **FicoJournalService** posts.

SD/MM adapters (`FicoAccountDeterminationService`, `FicoSdPostingService`) are **orchestration only** — not second engines.

## 04.03 Transaction keys

Canonical catalogue: `backend/src/fico/fico-transaction-key.catalog.ts`  
API: `GET /api/v1/fico/account-determination/transaction-keys`  
Sync: `POST /api/v1/fico/account-determination/transaction-keys/sync` (admin)

Legacy MM codes (`GR_IR`, `GI_COGS`, …) are retained; Phase 04 codes (e.g. `COGS`, `SALES_REVENUE`) are added for central rules and future modules (AP/AR/Tax/Treasury/AA/PP) as **CONFIG_ONLY** until integrations ship.

## 04.05 Centralized rule resolution engine

- **Contracts:** `fico-account-determination.types.ts` (`AccountDeterminationRequest`, `AccountDeterminationResult`, batch types).
- **Execution:** `FicoAccountResolutionService.resolveDetermination` and `resolveDeterminationBatch` (all-or-nothing structured failure).
- **API:** `POST /api/v1/fico/account-determination/resolve-determination`, `POST …/resolve-batch` (company access enforced).
- **Precedence:** documented in `fico-account-determination-policy.ts` — specificity (incl. transaction key on rule), lower `priority`, later `effectiveFrom`; **no** `createdAt` tie-break; ambiguous equal rank → `ConflictException`.
- **Wildcards:** rule `null` dimension only; required catalogue dimensions must be supplied by trusted adapters.
- **Posting-time:** `FicoPostingValidationService.assertAccountPostable` + accounting category checks (master-data types, not account code patterns).

## 04.06 Rule validation and conflict detection

- **Activation:** `FicoAccountDeterminationValidationService.assertSafeToActivate` (overlap, duplicate dimensions incl. `transactionKeyCode`, conflicting targets, ambiguous priorities, GL eligibility).
- **Rule signatures:** include `transactionKeyCode` in clone detection (`assertNoActiveClone`).
- **SD/POS:** `FicoSdPostingService` calls `resolveDetermination` per key; company default accounts remain an explicit configured fallback only (no silent swallow of resolution errors).

## 04.07 Legacy MM mapping migration

- **Report:** `POST /api/v1/fico/account-determination/mm-migration/dry-run?companyId=…` → full migration report (totals, invalid accounts, conflicts, legacy vs central diffs, rules ready vs finance review).
- **Draft rules:** `POST …/mm-migration/apply-drafts?companyId=…` creates **DRAFT** centralized rules from active legacy mappings (skips finance-review items).
- **Cutover modes:** `fico_company_accounting_settings.mmResolutionMode` + optional `mmLegacyFallbackUntil`.
- **Shadow:** `SHADOW_*` modes log `MM_ACCOUNT_DETERMINATION_SHADOW` and never double-post.
- **Legacy writes:** blocked when mode is `CENTRAL_ONLY`.

## 04.08–04.12 MM inventory, GR/IR, purchase variance

- **Policy:** `fico-mm-inventory-determination.policy.ts` — valuation-class-scoped keys, GR/IR clearing pairs, consumption/COGS/variance keys aligned to `mm_valuation_classes`.
- **Resolver:** `FicoAccountDeterminationService` uses canonical keys (`INVENTORY_LOSS`, `CONSUMPTION_EXPENSE`, `PURCHASE_VARIANCE`, …) with legacy code lookup.