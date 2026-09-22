# MM Domain Boundaries

Ownership matrix for Materials Management subdomains. When in doubt, consult [MM_DEPENDENCY_MAP](./MM_DEPENDENCY_MAP.md) and `.cursor/skills/materials-management/SKILL.md`.

Related: [MM_ARCHITECTURE](./MM_ARCHITECTURE.md) · [MM_QUALITY_ARCHITECTURE](./MM_QUALITY_ARCHITECTURE.md) · [MM_MRP_ARCHITECTURE](./MM_MRP_ARCHITECTURE.md)

---

## MM-01 Material Master

**Owns:** Material identity, types, categories, UOM, conversions, barcodes, batch/serial definitions, material usability flags.

**Does not own:** Physical stock, movements, supplier payment, GL.

**Backend:** `materials/`, `material-types/`, `material-categories/`, `uom/`, `barcodes/`, `batches/`, `serials/`

---

## MM-02 Supplier Management

**Owns:** Supplier master, categories, supplier-material links, pricing, payment terms, documents.

**Consumes:** MM-01 materials.

**Receives signals from:** MM-06/07/10/11 (performance inputs — not master ownership).

---

## MM-03 Warehouse Master

**Owns:** Warehouse, storage type/section/bin, capacity rules, putaway/picking rule configuration.

**Boundary:** MM-03 = *where* · MM-08 = *how much* · MM-09 = *physical execution tasks*.

**Backend:** `warehouse/` (master CRUD), `org.service.ts`

---

## MM-04 Valuation

**Owns:** Valuation methods, standard cost, cost layers, landed cost, price variance, valuation at post time.

**Consumes:** Inventory transactions (read), PO prices, landed cost allocations.

**Flows to:** FICO via `MmAccountingEvent` — never direct GL post.

**Strategies:** `valuation/strategies/` registry (FIFO, moving average, standard).

---

## MM-05 Planning / MRP

**Owns:** Demand, MRP runs, material requirements, procurement suggestions, planned orders, supply proposals, reorder rules.

**Must NOT:** Call `InventoryPostingService` or mutate balances/transactions.

See [MM_MRP_ARCHITECTURE](./MM_MRP_ARCHITECTURE.md).

---

## MM-06 Procurement

**Owns:** PR, RFQ, quotation, comparison, PO, contract, procurement history, three-way match bridge.

**Does not own:** Inventory. Output → MM-07 receiving.

**Workflow:** `WorkflowService` for PR/PO approval.

---

## MM-07 Receiving / Quality

**Owns:** Expected receipt, ASN, receiving documents, variances, inspection lots, quality holds, usage decisions.

**Posts via:** GR orchestration (`GoodsReceiptService`) → `InventoryPostingService`; quality status via `QualityDecisionService` → `STATUS_CHANGE`.

**Does not own:** Ledger rows directly.

See [MM_QUALITY_ARCHITECTURE](./MM_QUALITY_ARCHITECTURE.md).

---

## MM-08 Inventory Core

**Owns:**

- Inventory transactions (ledger)
- Inventory balances (operational state)
- Reservations, availability, ATP
- Stock status dimensions
- Traceability queries
- Physical posting (receipt, issue, transfer, adjustment, count, status change, reversal)
- GR/GI/adjustment **posting** (via stock-ops orchestration)

**Does not own:**

- Material master identity (MM-01)
- Warehouse topology master (MM-03) — consumes FKs
- Putaway/picking **task documents** (MM-09)
- Valuation policy setup (MM-04) — engine applies at post
- Inspection characteristics (MM-07)

---

## MM-09 Warehouse Execution

**Owns:** Putaway, picking, packing, bin transfers, warehouse tasks, task assignment, exceptions, STO coordination UI.

**On task confirm:** Completion handlers delegate to `InventoryPostingService` — never direct balance edit.

**Backend:** `warehouse/putaway|picking|packing|transfers|tasks/`, `stock-transfer/`, `stock-ops/warehouse-transfer-order.service.ts`

---

## MM-10 Inventory Control

**Owns:** Count policies, plans, sessions, tasks, blind entry, variance, recount, adjustment **approval requests**.

**Posts via:** Approved variances → `COUNT_GAIN` / `COUNT_LOSS` through MM-08 posting.

**Backend:** `inventory-control/` (count engine services)

---

## MM-11 Returns / Disposal / Traceability

**Owns:** Supplier return, customer return, disposal/scrap documents, expiry control, damaged/expired queries.

**Posts via:** `RETURN_IN`, `RETURN_OUT`, `SCRAP` through MM-08.

**Traceability:** `traceability/` — read/query over ledger + documents.

---

## MM-12 Barcode / Mobile

**Owns:** Scan events, device registration, mobile execution routing.

**Does not own:** Inventory math. Dedupes via `MmScannerEvent.idempotencyKey`; delegates to domain services.

**Backend:** `scanner/` (`BarcodeResolveService`, `MobileExecutionService`)

---

## MM-13 Supplier Performance

**Owns:** Score config, evaluation metrics, alerts (advisory), manual assessments.

**Derived domain** — reads PO, receipt, quality, returns; does not block suppliers automatically unless explicitly configured.

---

## MM-14 Reports / Analytics

**Read-only.** Aggregates ledger, master, valuation, procurement, warehouse, quality, supplier data.

**Must not** write back to operational MM tables.

**Backend:** `reports/`, `analytics/` (`AnalyticsService` facade with cache)

---

## MM-15 Dashboard

**Read-only KPI aggregation.** Two-phase load pattern (lite KPIs → analytics). Drills down to owning module pages.

**Backend:** `dashboard/` (`DashboardKpiService`, alerts, visibility)

---

## Document → posting responsibility

| Document | Owner module | Posts via | Reversal |
| --- | --- | --- | --- |
| Goods Receipt | MM-08 stock-ops | `RECEIPT` | Reverse each ledger line |
| Goods Issue | MM-08 stock-ops | `ISSUE` | Reversal transaction |
| Adjustment | MM-08 stock-ops | `ADJUSTMENT_IN/OUT` | Reversal |
| Cycle count variance | MM-10 → MM-08 | `COUNT_GAIN/LOSS` | Reversal |
| Bin transfer | MM-09 / stock-ops | `TRANSFER_OUT/IN` | Reversal pair |
| Inter-warehouse transfer | MM-09 / stock-transfer | `TRANSFER_OUT/IN`, `IN_TRANSIT` | Document reversal |
| Quality release | MM-07 | `STATUS_CHANGE` | Status change back |
| Supplier return | MM-11 | `RETURN_OUT` | Reversal |
| Customer return | MM-11 | `RETURN_IN` | Reversal |
| Disposal / scrap | MM-11 | `SCRAP` | Reversal |

---

## Cross-module write prohibition

| From | To | Allowed |
| --- | --- | --- |
| MM-06 Procurement | MM-08 balances | **No** — only via GR post |
| MM-05 MRP | MM-08 balances | **No** |
| MM-07 Quality | MM-08 balances | **Only** via `InventoryPostingService` |
| MM-09 Warehouse task | MM-08 balances | **Only** via posting on confirm |
| MM-12 Scanner | MM-08 balances | **Only** via domain service → posting |
| MM-14/15 Analytics | Any operational table | **No** (read-only) |
| Any MM module | FICO GL | **No** — via `MmAccountingEvent` |

Integration contracts: [MM_INTEGRATION_CONTRACTS](./MM_INTEGRATION_CONTRACTS.md).
