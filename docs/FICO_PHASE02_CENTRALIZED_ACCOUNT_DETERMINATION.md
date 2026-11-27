# FICO Phase 02 — Centralized Enterprise Account Determination

Phase 02 completes the centralized rule engine introduced in Phase 04 on top of the Phase 01 accounting foundation. **No second resolution service** was added — all paths still use `FicoAccountResolutionService`.

## Enterprise transaction keys

- Canonical catalogue: [backend/src/fico/fico-transaction-key.catalog.ts](../backend/src/fico/fico-transaction-key.catalog.ts)
- Phase 02 logical key aliases (GRIR, AP_RECON, INPUT_VAT, …): [backend/src/fico/fico-phase02-enterprise-keys.policy.ts](../backend/src/fico/fico-phase02-enterprise-keys.policy.ts)
- Rule lookup matches **canonical and alias** codes so legacy rules keep working.

## Rule context dimensions (Phase 02 additions)

| Dimension | Use |
| --- | --- |
| `materialGroupCode` | MM / PP material group scoping |
| `taxCodeId` | Tax-driven AP/AR/SD lines |
| `salesChannelCode` | SD / POS channel scoping |

Existing dimensions (company, module, transaction key/type, valuation class, payment method, branch, …) are unchanged. Irrelevant dimensions stay null (wildcard).

## MM integration

`INVENTORY_REVALUATION` is now a **LIVE** catalogue key resolved from `INVENTORY_REVALUATION` accounting effects (valuation engine / standard cost changes).

## Workbench UI

Account Determination workbench overview adds **domain configuration sections** (MM, AP, AR, SD/POS, Tax, Cash & Bank) to filter rules and open the transaction key catalogue.

## Invariants (unchanged)

- Posted journals store determination rule id/version; rule changes do not rewrite history.
- Simulation remains read-only.
- Ambiguous rules and missing configuration block posting with explicit errors.