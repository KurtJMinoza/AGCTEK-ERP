# FICO Account Determination — Architecture

Canonical architecture for centralized G/L account determination in AGCTEK ERP.
Companion documents: [transaction keys](FICO_ACCOUNT_DETERMINATION_TRANSACTION_KEYS.md),
[rule engine](FICO_ACCOUNT_DETERMINATION_RULE_ENGINE.md),
[migration](FICO_ACCOUNT_DETERMINATION_MIGRATION.md),
[integration](FICO_ACCOUNT_DETERMINATION_INTEGRATION.md),
[test results](FICO_ACCOUNT_DETERMINATION_TEST_RESULTS.md).

## 1. Previous architecture (before Phase 04)

| Aspect | State |
| --- | --- |
| MM accounts | `fico_mm_account_mappings` keyed by company + profile + transaction key + valuation scope |
| SD/POS accounts | `FicoSdPostingService` with silent fallback to company default accounts |
| Rule engine | `fico_account_determination_rules` existed but MM used it only for the first debit/credit line |
| Transaction keys | `fico_transaction_keys` rows without catalogue metadata or integration status |
| Failures | `mm_accounting_events` marked `FAILED` by the journal service and by the processor (two writers) |
| Dimensions | 6 (valuation class, material type, movement type, customer account group, sales org, distribution channel) |

### Defects found

| ID | Defect | Resolution |
| --- | --- | --- |
| G1 | Two MM configuration stores (rules + mappings) | Central rules preferred; legacy kept as auditable fallback with cutover modes |
| G2 | MM central path used only the first debit/credit line | Full rule lines resolved |
| G3 | Determination profile required even when central rules exist | Still required — documented gate, not yet relaxed |
| G5 | SD silently fell back to company defaults | Fallback is explicit and logged |
| G9 | Seeded rules stay `DRAFT` and never post | Surfaced as a configuration exception |

## 2. Target architecture

```text
Operational source transaction (MM / SD / POS)
  → durable accounting event (mm_accounting_events, idempotencyKey)
  → FicoAccountingConsumerService → FicoAccountingEventProcessorService (claim)
  → FicoJournalService.createFromAccountingEvent
       ├─ SD/POS payload → FicoSdPostingService
       └─ MM payload     → FicoAccountDeterminationService
            └─ FicoAccountResolutionService.resolveDetermination
  → FicoPostingValidationService (account + period eligibility)
  → FicoFinancialPostingEngine (document number, atomic header + lines)
  → General ledger
```

Operational modules emit **transaction context and amounts only**. They never choose G/L accounts.

## 3. Component ownership

| Component | Responsibility | Path |
| --- | --- | --- |
| `FicoAccountResolutionService` | **The** resolution engine: candidate matching, precedence, account eligibility, dry-run trace | [backend/src/fico/fico-account-resolution.service.ts](../backend/src/fico/fico-account-resolution.service.ts) |
| `FicoAccountDeterminationService` | MM adapter: central rules first, legacy mapping fallback per cutover mode | [fico-account-determination.service.ts](../backend/src/fico/fico-account-determination.service.ts) |
| `FicoSdPostingService` | SD/POS adapter: flat line composition per transaction key | [fico-sd-posting.service.ts](../backend/src/fico/fico-sd-posting.service.ts) |
| `FicoAccountDeterminationRulesService` | Rule lifecycle, validation, versioning, usage, coverage | [fico-account-determination-rules.service.ts](../backend/src/fico/fico-account-determination-rules.service.ts) |
| `FicoAccountDeterminationValidationService` | Activation safety: overlap, clones, ambiguity, GL eligibility | [fico-account-determination-validation.service.ts](../backend/src/fico/fico-account-determination-validation.service.ts) |
| `FicoAccountDeterminationSimulationService` | Read-only simulation and conflict analysis | [fico-account-determination-simulation.service.ts](../backend/src/fico/fico-account-determination-simulation.service.ts) |
| `FicoAccountDeterminationExceptionService` | Configuration + posting exception monitoring | [fico-account-determination-exception.service.ts](../backend/src/fico/fico-account-determination-exception.service.ts) |
| `FicoDeterminationSodPolicy` | Maker-checker enforcement | [fico-determination-sod.policy.ts](../backend/src/fico/fico-determination-sod.policy.ts) |
| `FicoTransactionKeyService` | Transaction key catalogue and CRUD | [fico-transaction-key.service.ts](../backend/src/fico/fico-transaction-key.service.ts) |
| `FicoJournalService` | **The** posting engine (also owns exact reversals) | [fico-journal.service.ts](../backend/src/fico/fico-journal.service.ts) |
| `FicoPostingValidationService` | Account postability + period control | [fico-posting-validation.service.ts](../backend/src/fico/fico-posting-validation.service.ts) |
| `FicoAuditService` | Append-only accounting audit trail | [fico-audit.service.ts](../backend/src/fico/fico-audit.service.ts) |

## 4. Data model

| Table | Role |
| --- | --- |
| `fico_account_determination_rules` | Central rules: company, module, transaction type, transaction key, 17 dimensions, priority, effective dates, lifecycle |
| `fico_account_determination_lines` | Debit/credit lines per rule (multi-line supported) |
| `fico_transaction_keys` | Persisted catalogue with `integrationStatus`, `owningModule`, `accountingCategory`, `systemDefined` |
| `fico_mm_account_mappings` | Legacy MM mappings retained for fallback and migration comparison |
| `fico_account_determination_profiles` | Legacy MM profile gate (still required per company) |
| `fico_company_accounting_settings` | COA assignment, MM cutover mode, `determinationSeparationOfDuties` |
| `mm_accounting_events` | Durable source events, error codes, attempt counts |
| `fico_accounting_audit_logs` | Append-only configuration audit (DB triggers reject UPDATE/DELETE) |

## 5. Invariants

1. One resolution engine. Adapters orchestrate; they never re-implement matching.
2. Failed determination **never** produces a posted journal — not even a header.
3. Reversals copy the original posted accounts and amounts; current rules are not consulted.
4. Posting always revalidates account eligibility, even if a rule resolved earlier.
5. Simulation is read-only: no journals, no document numbers, no event mutation.
6. Company isolation is enforced in the backend by `FicoCompanyAccessService` on every rule, simulation, exception and export path.
7. Rule history is append-only; activating a replacement never rewrites a prior version.