---
name: materials-management
description: >-
  Permanent Materials Management (MM) engineering contract for this existing ERP.
  Use before designing, implementing, modifying, debugging, or reviewing any MM
  work across MM-01…MM-15: material master, suppliers, warehouse master, valuation,
  MRP/planning, procurement, receiving/quality, inventory core, warehouse execution,
  inventory control, returns/disposal/traceability, barcode/mobile, supplier performance,
  analytics, and dashboard. Enforces InventoryPostingService as the sole physical stock
  writer and forbids parallel engines, duplicate services, and frontend stock math.
---

# Materials Management — Permanent Engineering Skill

## Mandate

You are the **Materials Management engineering specialist** for this **existing ERP**.

This is **not** a greenfield MM module. Before any design or code:

1. **Inspect** the repository (see [Repository inspection checklist](#repository-inspection-checklist)).
2. **Reuse** authoritative services, tables, routes, and UI patterns.
3. **Enhance** what exists — never create parallel engines or duplicate stock logic.
4. **Preserve** the mandatory posting invariant (below).

Also respect: `AGENTS.md`, `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md`, `.cursor/rules/erp-ui.mdc`, `.cursor/rules/mm-architecture.mdc`, `.cursor/rules/erp-architecture.mdc`.

**Enterprise role of MM:** material + inventory (sole physical posting engine; ATP authority; no FICO GL writes; no route optimization).

---

## Mandatory posting invariant

```text
Business Operation
  → InventoryPostingService          (backend/src/mm/inventory/inventory-posting.service.ts)
  → MmInventoryTransaction           (immutable ledger)
  → MmInventoryBalance               (derived operational state)
  → ValuationEngineService           (when cost-relevant)
  → MmInventoryAudit + MmDomainEventsService
  → MmAccountingEvent                (financial events → FICO bridge)
```

**Never** allow direct physical quantity mutation outside MM-08 inventory domain.

---

## Repository map

| Layer | Path |
| --- | --- |
| Backend Nest module | `backend/src/mm/mm.module.ts` |
| Backend domains | `backend/src/mm/{materials,supplier,warehouse,valuation,planning,purchase-*,rfq,inbound,receiving,inventory,stock-ops,inventory-control,returns-disposal,scanner,supplier-performance,analytics,dashboard,reports,common,...}/` |
| Prisma models | `backend/prisma/schema.prisma` (`Mm*`, `Wm*`, `Warehouse`, …) |
| Frontend modules | `src/modules/mm/` |
| Thin Next routes | `src/app/(protected-pages)/modules/mm/` |
| Nav config | `src/configs/erp-modules/mm.module.ts` |
| Architecture docs | `docs/MM_*.md` |
| Governance (Phase 6) | `docs/MM_ARCHITECTURE_RULES.md`, `docs/MM_FORBIDDEN_PATTERNS.md` |
| Architecture specs (tests) | `backend/src/mm/architecture/` — run `npm run test:architecture` |

**API prefix:** `/api/v1/mm/*` (global prefix in `backend/src/main.ts`).

**Cross-cutting:** `backend/src/mm/common/` — scope, auth, domain events, idempotency.

---

## MM domain ownership (MM-01 → MM-15)

| ID | Domain | Backend (authoritative) | Frontend |
| --- | --- | --- | --- |
| MM-01 | Material Master | `materials/`, `material-types/`, `material-categories/`, `uom/`, `barcodes/`, `batches/`, `serials/` | `material-master/` |
| MM-02 | Supplier Management | `supplier/` | `supplier-management/` |
| MM-03 | Warehouse Master | `warehouse/` (master, bins), `org.service.ts` | `warehouse/`, `organization/` |
| MM-04 | Valuation | `valuation/` (+ strategy registry) | `valuation/` |
| MM-05 | Planning / MRP | `planning/` — **read-only for stock** | `planning/` |
| MM-06 | Procurement | `purchase-requisition/`, `rfq/`, `purchase-order/`, `purchase-contract/`, `procurement/`, `workflow/` | `procurement/` |
| MM-07 | Receiving / Quality | `inbound/`, `receiving/` (inspection lots, holds, decisions) | `receiving/` |
| MM-08 | **Inventory Core** | `inventory/` + `stock-ops/` | `inventory/` |
| MM-09 | Warehouse Execution | `warehouse/putaway|picking|packing|transfers|tasks/` | `warehouse/`, `stock-transfer/` |
| MM-10 | Inventory Control | `inventory-control/` (count engine) | `inventory-control/` |
| MM-11 | Returns / Disposal / Traceability | `returns-disposal/`, `traceability/` | `returns-disposal/` |
| MM-12 | Barcode / Mobile | `scanner/` | `barcode-rfid/` |
| MM-13 | Supplier Performance | `supplier-performance/` | `supplier-performance/` |
| MM-14 | Reports / Analytics | `reports/`, `analytics/` | `reports-analytics/`, `analytics/` |
| MM-15 | Dashboard | `dashboard/` | `dashboard/` |

Full dependency order and document ownership: [docs/MM_DEPENDENCY_MAP.md](../../docs/MM_DEPENDENCY_MAP.md).

---

## 1. Inventory invariant (MM-08)

Physical stock changes **MUST** flow through `InventoryPostingService.postTransaction()` or `postTransferPair()`.

Applies to: `RECEIPT`, `ISSUE`, `TRANSFER_OUT/IN`, `COUNT_GAIN/LOSS`, `RETURN_IN/OUT`, `SCRAP`, `ADJUSTMENT_IN/OUT`, `STATUS_CHANGE`, and future movement types.

**Forbidden:**
- Controllers directly editing `MmInventoryBalance.quantity`
- React computing or persisting stock quantities
- Scanner/mobile maintaining separate inventory math
- MRP posting inventory
- Quality directly mutating balances (quality issues **STATUS_CHANGE** via posting service)
- Warehouse task completion writing balances directly
- Returns bypassing posting

**Authoritative MM-08 services:**

| Service | Role |
| --- | --- |
| `InventoryPostingService` | Sole physical stock writer |
| `MmInventoryBalanceService` / `InventoryBalanceQueryService` | Read balances |
| `InventoryAvailabilityService` | Central ATP |
| `InventoryReservationService` + `reservation-allocation/` | Reservations & allocation |
| `StockStatusService` | Status validation |
| `InventoryReversalService` | Reversal orchestration |
| `InventoryOperationService` | Typed facades |
| `InventoryTraceabilityService` | Batch/serial/document trace |

Stock-ops (`goods-receipt`, `goods-issue`, `adjustment`, `bin-transfer`, `warehouse-transfer-order`) **orchestrate documents** then call posting.

---

## 2. Ledger rule

- `MmInventoryTransaction` is **immutable** after post.
- **Never** `UPDATE` posted transaction quantities or movement types.
- Corrections = **reversal** transaction linked via `reversalOfId`.
- `MmInventoryBalance` is **derived/current state**, not historical truth.
- Ledger is the audit source of truth.

See [docs/MM_TRANSACTION_RULES.md](../../docs/MM_TRANSACTION_RULES.md).

---

## 3. Reservation rule

```text
Reservation  → reserves qty (reservedQuantity ↑, availableQuantity ↓)
Allocation   → identifies specific physical stock (FIFO/FEFO strategies)
Goods Issue  → physical reduction via InventoryPostingService
```

Reservation **does not** create inventory transactions or reduce `quantity`.

Engines: `InventoryReservationService`, `ReservationEngineService`, `AllocationEngineService` in `inventory/reservation-allocation/`.

---

## 4. Quality rule (MM-07)

Quality controls **stock usability** (status). Inventory controls **physical quantity**.

```text
RECEIPT (often QUALITY_INSPECTION status)
  → InspectionLot / QualityInspection
  → QualityDecision (ACCEPT | REJECT | REWORK | RETURN | …)
  → STATUS_CHANGE via InventoryPostingService (QualityDecisionService)
  → UNRESTRICTED | BLOCKED | QUARANTINE
```

**Models:** `MmInspectionPlan`, `MmInspectionCharacteristic`, `MmInspectionLot`, `MmInspectionSample`, `MmInspectionResult`, `MmInspectionDefect`, `MmQualityHold`, `MmQualityDecision`.

Legacy bridge: `MmQualityInspection` (inbound/) coexists with new receiving engine.

See [docs/MM_QUALITY_ARCHITECTURE.md](../../docs/MM_QUALITY_ARCHITECTURE.md).

---

## 5. MRP rule (MM-05)

MRP is **planning only**.

**May:** read inventory/ATP, reservations, open POs, expected receipts, demand, reorder rules; create `MmMrpRun`, `MmMaterialRequirement`, `MmProcurementSuggestion`, `MmPlannedOrder`, `MmSupplyProposal`; optionally create PR when configured.

**Must NOT:** import/call `InventoryPostingService`; post receipts/issues; update balances; create fake stock.

Enforced by architecture specs: `backend/src/mm/architecture/mm-guardrails.spec.ts`, `planning.spec.ts`, `advanced-mrp-engine.spec.ts`. Run `npm run test:architecture` from `backend/`.

See [docs/MM_MRP_ARCHITECTURE.md](../../docs/MM_MRP_ARCHITECTURE.md).

---

## 6. Procurement rule (MM-06)

Procurement creates: PR, RFQ, Quotation, Comparison, PO, Contract.

Procurement **does not** create inventory. Receiving (MM-07) bridges PO → GR → posting.

Workflow: `WorkflowService` + `MmWorkflowInstance` / `MmApprovalTask` for PR/PO approval.

---

## 7. Receiving rule (MM-07)

Receiving validates physical inbound goods. **Goods Receipt** is the controlled bridge to inventory posting.

```text
PO / ASN / Expected Receipt → Receiving → GR document → InventoryPostingService
```

**Do not create:** Receiving Inventory Engine, GR Inventory Engine, or alternate balance writers.

Services: `ReceivingService` (inbound/), `ReceivingDocumentService`, `GoodsReceiptService` (stock-ops/), `InspectionLotService`, `QualityDecisionService` (receiving/).

---

## 8. Warehouse rule (MM-09)

| Question | Owner |
| --- | --- |
| WHERE is stock? | MM-03 master + MM-09 execution (bins, tasks) |
| HOW MUCH exists? WHAT moved? WHAT is available? | MM-08 inventory |

Warehouse tasks (`warehouse/tasks/`) confirm putaway/pick/transfer/relocation → delegate posting on completion handlers.

Stock transfer orders: `backend/src/mm/stock-transfer/` + `stock-ops/warehouse-transfer-order.service.ts`.

---

## 9. Cross-module integration

MM integrates with SD, Production, FICO, Projects, Maintenance, SCM/Logistics, Notifications via **typed events** — not cross-module DB writes.

Use: `MmDomainEventsService` → `EventEmitter2` + `MmAccountingEvent` (financial outbox).

See [docs/MM_INTEGRATION_CONTRACTS.md](../../docs/MM_INTEGRATION_CONTRACTS.md) and [docs/MM_INTEGRATION_EVENTS.md](../../docs/MM_INTEGRATION_EVENTS.md).

---

## 10. Event rule

Canonical types in `backend/src/mm/common/mm-domain-events.types.ts`:

`GoodsReceiptPosted`, `GoodsIssuePosted`, `InventoryTransactionPosted`, `InventoryTransactionReversed`, `InventoryAdjusted`, `InventoryTransferred`, `ReservationCreated`, `ReservationReleased`, `QualityDecisionMade`, `SupplierReturnPosted`, `InspectionLotCreated`, `PutawayRequested`, `StockBelowSafetyLevel`, `PurchaseOrderOverdue`, …

Events must be: typed, versionable (payload extensibility), auditable, idempotent (consumer dedupe), traceable, safe to replay.

**Emit via** `MmDomainEventsService` — do not duplicate outbox tables.

---

## 11. Integration style

```text
Command → Domain Service → DB Transaction → Domain Event → Outbox (MmAccountingEvent) → Consumer
```

**Avoid:**

```text
Controller → arbitrary service → other module database write
```

---

## 12. Idempotency

All retry-prone writes must support idempotency:

- `MmInventoryTransaction.idempotencyKey` (unique)
- `MmScannerEvent.idempotencyKey`
- Helpers: `postingKey()`, `reversalKey()` in `backend/src/mm/common/idempotency.util.ts`

Applies to: posting, receiving, scanner, mobile, event consumers, integration APIs.

On duplicate key: return existing result (do not double-post).

---

## 13. Concurrency

Inventory posting uses:

- PostgreSQL **Serializable** transactions (`InventoryPostingService`)
- Optimistic **`version`** on `MmInventoryBalance`
- Atomic transfer pairs (`postTransferPair`)

Handle simultaneous receipts, allocations, issues, transfers, count adjustments, competing reservations.

---

## 14. Configuration over hardcoding

Prefer policies, strategies, and configuration tables over controller logic:

- Valuation: `valuation/strategies/` registry (FIFO, moving average, standard)
- Allocation: `reservation-allocation/strategies/` (FIFO, FEFO)
- Putaway/picking: `warehouse/tasks/strategies/`
- Count: `inventory-control/count-policy.service.ts`, tolerance profiles
- MRP: `MmReorderRule`, planning parameters on run
- Quality: `MmInspectionPlan`, inspection requirements
- Supplier scoring: `supplier-score-config.service.ts`

---

## 15. Frontend rule

Frontend = workflow/UI layer only.

**Do not duplicate:** ATP, availability, MRP netting, quality decisions, valuation, supplier scores.

**Use backend APIs**, e.g.:
- `GET /mm/inventory/available`
- Dashboard/analytics facades
- Planning/MRP run results

**UI stack:** ECME (`src/components/ui`), shared (`src/components/shared`), module pages (`src/modules/mm/`), thin routes.

**Performance (existing):** `mmReferenceCache.ts`, `MmWarmCache.tsx`, `useReferenceData(keys)`, `loading.tsx`, debounced `useQueryList`.

---

## 16. API rule

- Paths: `/api/v1/mm/*`
- Preserve existing endpoints; breaking changes require migration plan
- Controllers stay thin; domain logic in services
- Stock mutations: `@MmMutation()` + `MmAuthGuard` (`X-User-Id` header)

---

## 17. Testing rule

Every MM enhancement should include relevant tests:

| Test type | Location pattern |
| --- | --- |
| Unit / domain | `*.spec.ts` next to service |
| Posting integration | `inventory/inventory.spec.ts`, `inventory-core-hardening.spec.ts` |
| Architecture guards | `backend/src/mm/architecture/*.spec.ts` |
| MRP no-posting guard | `planning/planning.spec.ts`, `advanced-mrp-engine.spec.ts` |
| Scope / auth | `architecture/mm-scope.spec.ts`, `architecture/mm-auth.spec.ts` |
| Idempotency / concurrency | posting specs, stock-ops specs |
| Frontend | page/service behavior where applicable |

Run typecheck, lint, build, and affected specs before completion report.

---

## 18. Cursor implementation workflow

For **every** MM feature:

| Step | Action |
| --- | --- |
| 1 | Inspect existing implementation (schema, services, routes, UI, tests) |
| 2 | Identify reusable components |
| 3 | Identify duplicates/conflicts |
| 4 | Propose changes (minimal diff, no parallel engines) |
| 5 | Wait for approval on non-trivial architectural changes |
| 6 | Implement backend/domain/database |
| 7 | Implement API |
| 8 | Implement auth/workflow/audit/events |
| 9 | Implement frontend |
| 10 | Add tests |
| 11 | Run typecheck/lint/build/tests |
| 12 | Produce completion report |

**Never skip repository inspection.**

---

## 19. "Do not rebuild" rule

If capability exists → **enhance it**.

Do **not** create duplicate: tables, controllers, services, APIs, inventory logic, workflow engines, event systems, audit systems, availability calculators, or GR paths.

**Legacy note:** `WmInventoryBalance` is read-only legacy; canonical balance is `MmInventoryBalance`. Dual inbound paths (`inbound/` + `receiving/`) — extend receiving engine; do not add a third.

---

## 20. Document flow rule

Every transactional document must trace upstream/downstream.

**Inbound:**

```text
PR → RFQ → Quotation → PO → ASN/ER → Receiving → GR → Inspection → Putaway
  → Inventory Transaction → Valuation → FICO/AP
```

**Outbound:**

```text
Demand → Reservation → Allocation → Pick → Pack → GI
  → Inventory Transaction → Valuation → COGS/FICO
```

**Control:**

```text
Count Plan → Session → Entry → Variance → Recount → Adjustment Approval
  → COUNT_GAIN/LOSS → Ledger
```

Store `sourceDocumentType`, `sourceDocumentId`, `sourceDocumentLineId` on transactions.

---

## 21. Definition of done

**Not complete** when only UI, endpoint, or table exists.

**Complete** when all applicable items work:

- [ ] Domain logic correct and owned by right MM module
- [ ] Permissions (`MmAuthGuard`, roles)
- [ ] Organization scope (`MmScopeService`, company/plant/warehouse)
- [ ] Workflow (if transactional approval required)
- [ ] Audit (`MmInventoryAudit` for stock posts)
- [ ] Domain events (`MmDomainEventsService`)
- [ ] Idempotency (retry-safe)
- [ ] DB constraints and indexes
- [ ] Frontend wired to backend (no client stock math)
- [ ] Tests pass
- [ ] Existing MM flows remain intact

---

## 22. Pre-coding checklist

Answer before writing code:

1. Which **MM-0x** owns this?
2. What **document** is created/consumed?
3. Physical inventory change? → `InventoryPostingService`
4. Availability only? → Reservation/allocation path
5. Valuation / FICO impact?
6. Workflow / audit required?
7. Which **existing service** to reuse?
8. Which modules **consume** the output?
9. Idempotency key convention?
10. Is this a duplicate of something in `mm.module.ts`?

---

## 23. Repository inspection checklist

Inspect before any MM work:

```text
backend/src/mm/mm.module.ts          → registered providers/controllers
backend/src/mm/inventory/            → posting, availability, reservation
backend/src/mm/stock-ops/            → GR/GI/adjustment orchestration
backend/src/mm/common/               → scope, auth, events, idempotency
backend/prisma/schema.prisma         → Mm* models, constraints, indexes
backend/src/mm/planning/             → MRP (confirm no posting imports)
backend/src/mm/receiving/            → quality engine
backend/src/mm/warehouse/tasks/      → task completion → posting
src/modules/mm/                      → existing pages/services
src/configs/erp-modules/mm.module.ts → nav/routes
docs/MM_*.md                         → architecture contracts
.cursor/skills/materials-management/  → this skill
backend/src/mm/architecture/         → architecture regression specs
```

---

## 24. Additional resources

| Document | Purpose |
| --- | --- |
| [reference.md](reference.md) | Extended historical contract (flows, permissions, tables) |
| [docs/MM_ARCHITECTURE.md](../../docs/MM_ARCHITECTURE.md) | System architecture overview |
| [docs/MM_DOMAIN_BOUNDARIES.md](../../docs/MM_DOMAIN_BOUNDARIES.md) | Ownership matrix |
| [docs/MM_DEPENDENCY_MAP.md](../../docs/MM_DEPENDENCY_MAP.md) | MM-01→15 build order |
| [docs/MM_TRANSACTION_RULES.md](../../docs/MM_TRANSACTION_RULES.md) | Posting, movement types, reversal |
| [docs/MM_INTEGRATION_EVENTS.md](../../docs/MM_INTEGRATION_EVENTS.md) | Event catalog |
| [docs/MM_INTEGRATION_CONTRACTS.md](../../docs/MM_INTEGRATION_CONTRACTS.md) | Cross-module contracts |
| [docs/MM_QUALITY_ARCHITECTURE.md](../../docs/MM_QUALITY_ARCHITECTURE.md) | Quality inspection model |
| [docs/MM_MRP_ARCHITECTURE.md](../../docs/MM_MRP_ARCHITECTURE.md) | MRP engine contract |

---

## Final principle

```text
              MATERIALS MANAGEMENT (MM-01…15)
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
  PLANNING        PROCUREMENT       WAREHOUSE
  (read stock)    (docs only)    (where/how)
      │                │                │
      └────────────────┼────────────────┘
                       ▼
              INVENTORY POSTING SERVICE
                       │
                       ▼
               INVENTORY LEDGER (immutable)
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         BALANCE    VALUATION   AUDIT/EVENTS
                       │
                       ▼
                      FICO
```

**One posting service. One ledger. Enhance — do not rebuild.**
