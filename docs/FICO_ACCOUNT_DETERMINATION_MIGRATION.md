# FICO Account Determination — Legacy MM Mapping Migration

Service: [FicoMmMappingMigrationService](../backend/src/fico/fico-mm-mapping-migration.service.ts).

## Why both stores still exist

`fico_mm_account_mappings` (company + profile + transaction key + valuation scope →
debit/credit) predates the central rule engine. It is retained so MM posting keeps
working while each company moves to centralized rules, and so legacy and central
resolution can be compared before cutover.

## Cutover modes

`fico_company_accounting_settings.mmResolutionMode` — see [fico-mm-resolution-mode.constants.ts](../backend/src/fico/fico-mm-resolution-mode.constants.ts):

| Mode | Behaviour |
| --- | --- |
| `LEGACY_ONLY` | Legacy mappings resolve MM accounts |
| `SHADOW_LEGACY_PRIMARY` | Legacy posts; central is resolved and compared, logged as `MM_ACCOUNT_DETERMINATION_SHADOW` |
| `SHADOW_CENTRAL_PRIMARY` | Central posts; legacy is resolved and compared |
| `CENTRAL_WITH_TIMED_FALLBACK` | Central preferred; legacy allowed until `mmLegacyFallbackUntil` |
| `CENTRAL_ONLY` | Central only; a missing rule raises a determination error and blocks posting |

Shadow modes never double-post. Legacy mapping **writes** are blocked once the mode is `CENTRAL_ONLY`.

## Migration workflow

```text
1. POST /account-determination/migration/dry-run?companyId=…
     → report: totals, missing keys, invalid accounts, conflicts, legacy-vs-central differences,
       rules ready for activation, rules requiring finance review
2. POST /account-determination/migration/compare?companyId=…
     → same report with central comparison forced on
3. POST /account-determination/mm-migration/apply-drafts?companyId=…
     → creates DRAFT centralized rules from ACTIVE legacy mappings (skips finance-review items)
4. Finance validates → submits → approves → activates each rule
5. Switch mmResolutionMode to a SHADOW mode, then CENTRAL_* after comparison is clean
```

### Report contents

| Field | Meaning |
| --- | --- |
| `totalLegacyMappings` | Active legacy mappings examined |
| `successfullyTransformed` | Mappings convertible to a central rule |
| `missingTransactionKeys` | Mapping keys absent from the enterprise catalogue |
| `invalidAccountAssignments` | Mappings whose debit/credit account is not postable |
| `conflictingRules` | Proposed rules clashing with an existing active rule |
| `resolutionDifferences` | Legacy vs central target accounts per key/valuation class |
| `rulesReadyForActivation` | Proposals with no detected problem |
| `rulesRequiringFinanceReview` | Proposals needing a human decision |

## Authorization

Migration endpoints require the dedicated resource
**`fico.account-determination-migration`** (`read` for dry-run/compare, `update`
for apply-drafts) — separate from ordinary rule maintenance.

`apply-drafts` only ever creates **drafts**. It never activates rules, never edits
posted journals, and never deletes legacy mappings. There is no unrestricted
production data-migration endpoint; execution stays behind the approval workflow
plus a controlled deployment command.

## Reconciliation after cutover

The exception monitor raises `LEGACY_MIGRATION_DISCREPANCY` when a company still
has active legacy mappings but no active centralized rules, and
`MISSING_DETERMINATION_RULE` for every LIVE transaction key without an active rule.