---
name: mrp
description: >-
  Materials Management planning and MRP. Use for demand, projected stock, MRP runs,
  requirements, procurement suggestions, and explainability. Planning never posts inventory.
---

# MRP / Planning (MM-05) — Agent Skill

**Contract:** [AGENTS.md](../../../AGENTS.md) · **Master flow:** [docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md](../../../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md) · **MM master skill:** [materials-management/SKILL.md](../materials-management/SKILL.md)

## Invariant

MRP is **planning only**.

**May:** read balances, availability, reservations, open supply/demand; compute projected stock and net requirements; create recommendations, planned orders, procurement suggestions.

**Must never:** post inventory, mutate ledger/balances, or create fictitious receipts.

## Explainability

Recommendations should capture demand source, supply, dates, projected stock, shortage, safety/reorder context, quantity, and reason (see `explanationJson` patterns on MRP models).

## Authoritative docs

- [docs/MM_MRP_ARCHITECTURE.md](../../../docs/MM_MRP_ARCHITECTURE.md)
- [docs/MM_MRP_RULES.md](../../../docs/MM_MRP_RULES.md)

## Backend (inspect before changing)

- `backend/src/mm/planning/`
- Prisma: `MmMrpRun`, `MmMaterialRequirement`, `MmProcurementSuggestion`, `MmPlanningDemand`, etc.

## Frontend

- `src/modules/mm/planning/` — display backend snapshots; no client-side MRP engine.
