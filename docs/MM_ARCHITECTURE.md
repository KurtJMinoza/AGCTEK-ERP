# MM Architecture

Materials Management (MM) is an integrated ERP domain. Physical inventory truth lives in one ledger engine; business modules post through it.

## Core posting chain

```text
Business Document / Operation
  → InventoryPostingService
  → MmInventoryTransaction (immutable)
  → MmInventoryBalance (derived operational state)
  → ValuationEngineService (when cost-relevant)
  → MmInventoryAudit + domain events
```

**Non-negotiable:** Never update `MmInventoryBalance.quantity` from controllers, frontend, receiving, warehouse execution, scanner, or adjustment pages directly.

## Module map (MM-01 → MM-15)

| ID | Domain | Backend path |
| --- | --- | --- |
| MM-01 | Material Master | `backend/src/mm/materials/`, `uom/`, `barcodes/`, `batches/`, `serials/` |
| MM-02 | Supplier Management | `backend/src/mm/supplier/` |
| MM-03 | Warehouse Master | `backend/src/mm/warehouse/` (+ org via `org.service.ts`) |
| MM-04 | Valuation | `backend/src/mm/valuation/` |
| MM-05 | Planning / MRP | `backend/src/mm/planning/` — must not post inventory |
| MM-06 | Procurement | `purchase-requisition/`, `rfq/`, `purchase-order/` |
| MM-07 | Receiving | `backend/src/mm/inbound/` |
| MM-08 | **Inventory core** | `backend/src/mm/inventory/` |
| MM-09 | Warehouse execution | `warehouse/putaway|picking|packing|transfers/` |
| MM-10 | Inventory control | `inventory-control/` |
| MM-11 | Returns & disposal | `returns-disposal/` |
| MM-12 | Barcode / scanner channel | `scanner/` — routes to domain services |
| MM-13–15 | Performance, reports, dashboard | respective folders |

See also [MM_DEPENDENCY_MAP.md](./MM_DEPENDENCY_MAP.md) and [MM_DOMAIN_BOUNDARIES.md](./MM_DOMAIN_BOUNDARIES.md).

## MM-08 inventory services

| Service | Responsibility |
| --- | --- |
| `InventoryPostingService` | Single write path for physical quantity changes |
| `InventoryBalanceService` | Read balances, aggregations |
| `InventoryAvailabilityService` | Central ATP: on-hand − reserved − restricted |
| `InventoryReservationService` | Reservation allocation (reserved qty only) |
| `StockStatusService` | Status validation and STATUS_CHANGE posting |
| `InventoryTraceabilityService` | Batch/serial/document trace queries |
| `InventoryReversalService` | Reversal orchestration |
| `InventoryOperationService` | Typed API facades (receipt, issue, transfer, adjustment) |

## Availability formula

```text
Available (UNRESTRICTED ATP) = Unrestricted On-Hand − Reserved
Restricted stock (QI, BLOCKED, QUARANTINE, etc.) is excluded from ATP.
```

Frontend and reports must consume `GET /mm/inventory/available` — never recompute locally.

## Reservation exception

`InventoryReservationService` updates `reservedQuantity` and `availableQuantity` on balances but **never** changes physical `quantity`. This is intentional MM-08 allocation semantics.

## Cross-cutting infrastructure (`backend/src/mm/common/`)

- `MmScopeService` — company ↔ warehouse ↔ material ↔ bin validation
- `MmAuthGuard` + `@MmMutation()` — authenticated stock mutations (`X-User-Id`)
- `MmDomainEventsService` — typed integration events + `MmAccountingEvent` persistence
- `postingKey()` / `reversalKey()` — idempotency helpers

Also:

- Organization: `OrgService` (company, plant, branch, warehouse)
- Workflow: `WorkflowService` (PR/PO approval)
- Audit: `MmInventoryAudit` on every post/reversal
- Idempotency: `idempotencyKey` on transactions and scanner events
- Concurrency: Serializable transactions + optimistic `version` on balances

## Legacy note

`WmInventoryBalance` is read-only legacy. Canonical balance is `MmInventoryBalance`.
