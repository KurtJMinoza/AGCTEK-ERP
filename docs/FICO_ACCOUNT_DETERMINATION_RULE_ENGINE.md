# FICO Account Determination — Rule Engine

Engine: [FicoAccountResolutionService](../backend/src/fico/fico-account-resolution.service.ts).
Precedence policy: [fico-account-determination-policy.ts](../backend/src/fico/fico-account-determination-policy.ts).

## 1. Rule configuration model

| Field | Meaning |
| --- | --- |
| `determinationCode` | Unique human code (`MM-001`, `MM-001-V2`) |
| `companyId` | Company scope — rules never cross companies |
| `sourceModule` | `MM` · `SD` · `PP` · `TREASURY` · `AP` · `AR` · `AA` · `CO` |
| `transactionType` | Module transaction type (e.g. `GOODS_RECEIPT`) |
| `transactionKeyCode` | Optional catalogue key; adds specificity when matched |
| `priority` | Lower number wins between equally specific rules |
| `effectiveFrom` / `effectiveTo` | Validity window (`null` = open-ended) |
| `status` | `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `ACTIVE` → `INACTIVE`, plus `REJECTED` |
| `lines[]` | Debit/credit lines with G/L accounts (at least one of each) |

## 2. Supported dimensions

`FICO_DETERMINATION_DIMENSIONS` in [fico-account-determination.constants.ts](../backend/src/fico/fico-account-determination.constants.ts):

| Group | Dimensions |
| --- | --- |
| Material / production | `valuationClassId`, `materialTypeCode`, `movementType`, `productionOrderTypeCode`, `costElementCategoryCode`, `controllingAreaCode` |
| Sales | `customerAccountGroup`, `salesOrganization`, `distributionChannel` |
| Treasury / payment | `paymentMethodCode`, `bankAccountId`, `paymentProviderCode`, `currencyCode`, `branchId` |
| Asset accounting | `assetClassCode`, `depreciationAreaCode`, `documentTypeCode` |

`FICO_DETERMINATION_ID_DIMENSIONS` (`valuationClassId`, `branchId`, `bankAccountId`) match by exact id; all other dimensions match case-insensitively.

**Wildcards:** only a rule may be a wildcard (dimension `null`). A caller cannot wildcard a dimension a rule constrains — if the rule constrains it and the caller cannot supply it, the rule is rejected.

Per-module authoring hints come from [fico-rule-authoring-dimensions.policy.ts](../backend/src/fico/fico-rule-authoring-dimensions.policy.ts) and are exposed as `authoringDimensionsByModule` on the reference API.

## 3. Matching precedence

Deterministic, evaluated in order:

1. **Specificity** — count of matched constrained dimensions, plus 1 when the rule's transaction key matched.
2. **Priority** — lower numeric value wins.
3. **Effective-from** — later start date wins (scheduled replacement).

Equal rank is **not** resolved. Creation timestamps are never a tie-breaker.

- Equal rank with different target accounts → `ConflictException` ("Ambiguous …").
- Equal rank with identical targets → `ConflictException` ("Conflicting …", narrow dimensions or change priorities).

Only `status = ACTIVE` rules effective on the posting date are candidates: drafts, pending, approved, rejected and inactive rules never post.

## 4. Account validation at resolution

Every resolved line passes `FicoPostingValidationService.assertAccountPostable`:

- account exists and belongs to the company chart of accounts,
- `status = ACTIVE`,
- posting account, automatic posting allowed,
- company assignment present,
- currency restriction satisfied,
- posting period open for the posting date.

Additionally `ficoAssertAccountTypeForCategory` checks the account **type** against the transaction key's accounting category.

## 5. Rule lifecycle

```text
DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ APPROVED ──activate──▶ ACTIVE
  ▲                      │                                               │
  │                   reject                                        deactivate
  │                      ▼                                               ▼
  └────── (edit) ──── REJECTED ──resubmit──▶ PENDING_APPROVAL         INACTIVE ──activate──▶ ACTIVE
```

- Only `DRAFT` rules can be edited or deleted.
- Activation requires a recorded approval (`approvedBy` + `approvedAt`).
- Activation re-runs `assertSafeToActivate`: overlap, duplicate dimension signature, conflicting targets, ambiguous priorities, G/L eligibility.
- Activation and its audit record commit in **one transaction**, guarded by a status-scoped update so two concurrent activations cannot both succeed.

### Approval policy (maker-checker)

`fico_company_accounting_settings.determinationSeparationOfDuties` (default **true**):

- the submitter may not approve the same rule;
- the author may not approve an unsubmitted draft;
- a user who both submitted and approved may not also activate.

Enforced in [fico-determination-sod.policy.ts](../backend/src/fico/fico-determination-sod.policy.ts) — backend only.

## 6. Versioning and history

`POST /rules/:id/new-version` creates a `DRAFT` successor (`<CODE>-V<n>`) with the
same dimensions and lines and a proposed effective-from. The predecessor keeps its
own validity window until Finance closes or deactivates it, so:

- postings before the cutover resolve the predecessor,
- postings after the cutover resolve the successor,
- posted journals are never rewritten,
- both versions stay queryable and auditable.

`GET /rules/:id/history` returns the append-only audit trail for the rule.

## 7. Simulation

[FicoAccountDeterminationSimulationService](../backend/src/fico/fico-account-determination-simulation.service.ts) — modes `SINGLE_KEY`, `MULTI_KEY`, `SOURCE_DOCUMENT`, `DRAFT_RULE`.

Output includes requested key, company, chart of accounts, module, posting date,
input dimensions, candidate rules with matched and unmatched conditions, rejected
candidates with reasons, priority, rule version, selected rule, resolved accounts,
resolution scope, warnings and configuration errors.

`traceCandidates` performs the dry run. Simulation responses carry
`safeDryRun: true` and never create journals, consume document numbers, activate
rules, or touch accounting events. Final posting always repeats real resolution and validation.

`POST /validate-conflicts` reports overlapping candidate pairs: identical
dimensions and overlapping validity, flagged as ambiguous when priorities tie and
targets differ.

## 8. Error codes

See [fico-determination-error.ts](../backend/src/fico/fico-determination-error.ts). Responses carry `errorCode`, `message` and a `context` block (company, transaction key, posting date, dimensions, remediation). Stack traces are never returned.

## 9. Query shape and indexes

Resolution filters on company + module + transaction type + `ACTIVE` + effective window + optional transaction key, so a posting never loads the full rule table. Rule lines and G/L accounts are fetched in the same query (no N+1).

Indexes on `fico_account_determination_rules`:

```text
(companyId, sourceModule, transactionType, status)
(companyId, sourceModule, status, priority)
(companyId, transactionKeyCode, status, priority)
(companyId, status, effectiveFrom, effectiveTo)
(transactionKeyCode) · (valuationClassId) · (materialTypeCode)
(branchId) · (paymentMethodCode) · (bankAccountId)
```

**No resolution cache is implemented.** Correct financial resolution is preferred over cache speed; if one is added it must be keyed by company + dimensions + posting date + configuration revision and invalidated on activation/deactivation, with eligibility revalidated at posting.