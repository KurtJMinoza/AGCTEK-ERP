# MM Architecture

Materials Management (MM) is an integrated ERP domain in this **existing** codebase. Physical inventory truth lives in one ledger engine; all business modules post through it.

**Enterprise parent contract:** [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md) (CRM · SD · MM · SCM · FICO ownership and end-to-end cycles).

**Skill (agents):** `.cursor/skills/materials-management/SKILL.md`

Related: [MM_ARCHITECTURE_RULES](./MM_ARCHITECTURE_RULES.md) · [MM_FORBIDDEN_PATTERNS](./MM_FORBIDDEN_PATTERNS.md) · [MM_DEPENDENCY_MAP](./MM_DEPENDENCY_MAP.md) · [MM_DOMAIN_BOUNDARIES](./MM_DOMAIN_BOUNDARIES.md) · [MM_TRANSACTION_RULES](./MM_TRANSACTION_RULES.md) · [MM_INTEGRATION_EVENTS](./MM_INTEGRATION_EVENTS.md) · [MM_INTEGRATION_CONTRACTS](./MM_INTEGRATION_CONTRACTS.md) · [MM_QUALITY_ARCHITECTURE](./MM_QUALITY_ARCHITECTURE.md) · [MM_MRP_ARCHITECTURE](./MM_MRP_ARCHITECTURE.md)

---

## Core posting chain (mandatory invariant)

```text
Business Document / Operation
  → InventoryPostingService          backend/src/mm/inventory/inventory-posting.service.ts
  → MmInventoryTransaction           immutable ledger
  → MmInventoryBalance               derived operational state
  → ValuationEngineService           when cost-relevant
  → MmInventoryAudit + MmDomainEventsService
  → MmAccountingEvent                financial outbox → FICO
```

**Non-negotiable:** Never update `MmInventoryBalance.quantity` from controllers, frontend, receiving, warehouse execution, scanner, MRP, or adjustment pages directly.

---

## Module map (MM-01 → MM-15)

| ID | Domain | Backend path | Frontend path |
| --- | --- | --- | --- |
| MM-01 | Material Master | `materials/`, `uom/`, `barcodes/`, `batches/`, `serials/` | `material-master/` |
| MM-02 | Supplier Management | `supplier/` | `supplier-management/` |
| MM-03 | Warehouse Master | `warehouse/` (master), `org.service.ts` | `warehouse/`, `organization/` |
| MM-04 | Valuation | `valuation/` + strategy registry | `valuation/` |
| MM-05 | Planning / MRP | `planning/` — **must not post inventory** | `planning/` |
| MM-06 | Procurement | `purchase-requisition/`, `rfq/`, `purchase-order/`, `procurement/`, `workflow/` | `procurement/` |
| MM-07 | Receiving / Quality | `inbound/`, `receiving/` | `receiving/` |
| MM-08 | **Inventory core** | `inventory/`, `stock-ops/` | `inventory/` |
| MM-09 | Warehouse execution | `warehouse/putaway|picking|packing|transfers|tasks/`, `stock-transfer/` | `warehouse/`, `stock-transfer/` |
| MM-10 | Inventory control | `inventory-control/` (count engine) | `inventory-control/` |
| MM-11 | Returns & disposal | `returns-disposal/`, `traceability/` | `returns-disposal/` |
| MM-12 | Barcode / mobile | `scanner/` | `barcode-rfid/` |
| MM-13 | Supplier performance | `supplier-performance/` | `supplier-performance/` |
| MM-14 | Reports / analytics | `reports/`, `analytics/` | `reports-analytics/`, `analytics/` |
| MM-15 | Dashboard | `dashboard/` | `dashboard/` |

NestJS registration: `backend/src/mm/mm.module.ts` (~400 providers/controllers).

---

## MM-08 inventory services

| Service | Responsibility |
| --- | --- |
| `InventoryPostingService` | **Single write path** for physical quantity changes |
| `MmInventoryBalanceService` | Balance reads/aggregations |
| `InventoryBalanceQueryService` | Query-optimized balance access |
| `InventoryAvailabilityService` | Central ATP: unrestricted on-hand − reserved |
| `InventoryReservationService` | Reservation qty (no physical movement) |
| `ReservationEngineService` / `AllocationEngineService` | Allocation strategies (FIFO/FEFO) |
| `StockStatusService` | Status validation; STATUS_CHANGE posting |
| `InventoryTraceabilityService` | Batch/serial/document trace |
| `InventoryReversalService` | Reversal orchestration |
| `InventoryOperationService` | Typed API facades |
| `InventoryEventsService` | Internal MM-08 event helpers |

Stock-ops orchestrators (call posting, do not duplicate math):

- `GoodsReceiptService`, `GoodsIssueService`, `AdjustmentService`
- `BinTransferService`, `WarehouseTransferOrderService`

---

## Availability formula

```text
Available (UNRESTRICTED ATP) = Unrestricted On-Hand − Reserved
```

Restricted stock (`QUALITY_INSPECTION`, `BLOCKED`, `QUARANTINE`, `IN_TRANSIT`, `EXPIRED`, `DAMAGED`) is excluded from ATP.

Frontend and reports **must** consume `GET /mm/inventory/available` — never recompute locally.

---

## Reservation semantics

`InventoryReservationService` updates `reservedQuantity` and `availableQuantity` on balances but **never** changes physical `quantity`. Goods Issue performs the physical reduction via posting.

---

## Cross-cutting infrastructure

Location: `backend/src/mm/common/`

| Component | Role |
| --- | --- |
| `MmScopeService` | Company ↔ warehouse ↔ material ↔ bin validation before post |
| `MmAuthGuard` + `@MmMutation()` | Authenticated stock mutations (`X-User-Id` header) |
| `MmDomainEventsService` | Typed integration events + `MmAccountingEvent` persistence |
| `postingKey()` / `reversalKey()` | Idempotency helpers |
| `MmCommonModule` | Shared module exports |

Also:

- **Organization:** `OrgService` / `OrgController` — company, plant, branch, warehouse
- **Workflow:** `WorkflowService` — PR/PO approval (`MmWorkflowInstance`, `MmApprovalTask`)
- **Audit:** `MmInventoryAudit` on every post/reversal
- **Concurrency:** Serializable transactions + optimistic `version` on `MmInventoryBalance`

Architecture regression specs: `backend/src/mm/architecture/*.spec.ts`

---

## API surface

- Global prefix: `/api/v1` (`backend/src/main.ts`)
- MM routes: `/api/v1/mm/*`
- Example: `@Controller('mm/inventory')` → `/api/v1/mm/inventory`

Preserve existing endpoints; breaking changes require migration plan.

---

## Frontend architecture

| Layer | Path |
| --- | --- |
| Module pages | `src/modules/mm/{domain}/pages/` |
| Services | `src/modules/mm/{domain}/services/` |
| Thin routes | `src/app/(protected-pages)/modules/mm/` |
| Nav | `src/configs/erp-modules/mm.module.ts` |
| Shared MM utilities | `src/modules/mm/shared/` (`mmReferenceCache`, `useQueryList`, `MmWarmCache`) |
| Loading UX | `src/app/(protected-pages)/modules/mm/loading.tsx` |

UI: ECME components only — see `AGENTS.md` and `.cursor/rules/erp-ui.mdc`.

---

## Document flows (summary)

**Inbound:** PR → RFQ → Quotation → PO → ASN → Receiving → GR → Inspection → Putaway → Ledger → Valuation → FICO

**Outbound:** Demand → Reservation → Allocation → Pick → Pack → GI → Ledger → Valuation → COGS

**Control:** Count plan → Session → Entry → Variance → Approval → COUNT_GAIN/LOSS → Ledger

Full ownership table: [MM_DEPENDENCY_MAP](./MM_DEPENDENCY_MAP.md).

---

## Legacy notes

- `WmInventoryBalance` — read-only legacy; canonical balance is `MmInventoryBalance`.
- Dual receiving paths: `inbound/` (legacy) + `receiving/` (quality hardening). Extend receiving engine; do not add a third path.
- Legacy event aliases still emitted — see [MM_INTEGRATION_EVENTS](./MM_INTEGRATION_EVENTS.md).

---

## Definition of done (architecture)

A feature is architecturally complete when:

1. Correct MM-0x module owns the document and logic
2. Physical changes use `InventoryPostingService`
3. Scope, auth, audit, and events are wired
4. Idempotency and concurrency rules applied
5. No duplicate engines or balance writers introduced
6. Tests pass including architecture guards where relevant
