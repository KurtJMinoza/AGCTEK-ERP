# MM MRP Rules

MRP (MM-05) is **planning only**. It reads supply/demand signals and produces recommendations — it never mutates physical stock.

Related: [MM_MRP_ARCHITECTURE.md](./MM_MRP_ARCHITECTURE.md) · [MM_DEMAND_INTEGRATION.md](./MM_DEMAND_INTEGRATION.md)

---

## MRP may

- Read `MmInventoryBalance`, ATP, reservations, open POs, expected receipts
- Run `MmMrpRun`, create `MmMaterialRequirement`, `MmProcurementSuggestion`, `MmPlannedOrder`
- Consume normalized demand via `MmDemandAggregationService` (single loader)
- Create PR when configured (procurement document — not inventory)

---

## MRP must NOT

- Import or inject `InventoryPostingService`
- Call `postTransaction()` or `postTransferPair()`
- Update `MmInventoryBalance.quantity`
- Create `MmInventoryTransaction` rows
- Maintain shadow inventory or “planned stock” balances

---

## Demand integration

All external demand (SD, Production, Maintenance, Projects) flows through:

```text
MmDemandProvider → MmDemandRegistryService → MmDemandAggregationService → MrpScopeLoaderService
```

No per-module MRP engines.

---

## Automated check

Rule **MM-05-MRP** in `backend/src/mm/architecture/mm-guardrails.spec.ts` fails if any file under `backend/src/mm/planning/` references `InventoryPostingService` or `postTransaction(`.

Additional guards in `planning.spec.ts`, `advanced-mrp-engine.spec.ts`, `mrp-planning-phase2a.spec.ts`.

---

## When planning discovers shortage

Correct response:

1. Record requirement / suggestion with explanation
2. Surface in Exception Center (`MRP_SHORTAGE`)
3. User creates PR or PO in procurement
4. Receiving → GR → `InventoryPostingService`

Incorrect: MRP “auto-receipts” or adjusts balances.
