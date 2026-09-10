# MM-01 → MM-15 Dependency Architecture

Canonical dependency map for Materials Management: **build order**, **document ownership**, **consumers**, and **update authority**. Use this before designing or implementing any MM feature.

Related: [Materials Management skill](../.cursor/skills/materials-management/SKILL.md) · [Full contract](../.cursor/skills/materials-management/reference.md) · [Component catalog](./COMPONENT_CATALOG.md)

---

## Repo mapping (this codebase)

| ID | Domain | Backend (`backend/src/mm/`) | Frontend (`src/modules/mm/`) |
| --- | --- | --- | --- |
| MM-01 | Material Master | `materials/`, `material-types/`, `material-categories/`, `uom/`, `uom-conversions/`, `barcodes/`, `batches/`, `serials/` | `material-master/` |
| MM-02 | Supplier Management | `supplier/`, `supplier-performance/` (master) | `supplier-management/`, `supplier-performance/` |
| MM-03 | Warehouse Management | `warehouse/` (master, bins, rules) | `warehouse/` |
| MM-04 | Valuation | `valuation/` | `valuation/` |
| MM-05 | Planning / MRP | `planning/` | `planning/` |
| MM-06 | Procurement | `purchase-requisition/`, `rfq/`, `purchase-order/`, `procurement-history/`, `workflow/` | `procurement/` |
| MM-07 | Receiving | `inbound/` (ASN, expected receipt, receiving, inspection) | `receiving/` |
| MM-08 | Inventory (ledger engine) | `inventory/` (**`inventory-posting.service.ts`**), `stock-ops/` (GR/GI/adjustment) | `inventory/` |
| MM-09 | Warehouse execution | `warehouse/putaway/`, `warehouse/picking/`, `warehouse/packing/`, `warehouse/transfers/` | `warehouse/` (putaway, picking, packing, transfers) |
| MM-10 | Inventory control | `inventory-control/` | `inventory-control/` |
| MM-11 | Returns & disposal | `returns-disposal/` | `returns-disposal/` |
| MM-12 | Barcode / RFID | `scanner/` | `barcode-rfid/` |
| MM-13 | Supplier performance | `supplier-performance/` | `supplier-performance/` |
| MM-14 | Reports & analytics | `reports/` | `reports-analytics/` |
| MM-15 | Dashboard | `dashboard/` | `dashboard/` |

**Cross-cutting:** `workflow/` (approval), audit/events on all transactional domains, `three-way-match/` (procure-to-pay bridge).

**Central engine (non-negotiable):** `backend/src/mm/inventory/inventory-posting.service.ts` — all physical stock changes post here.

---

## Dependency diagram

```text
                         MATERIALS MANAGEMENT
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ MM-01 MATERIAL MASTER                                                │
│ Materials / SKU · Types / Categories / UOM / Conversions             │
│ Barcodes / Batches / Serials                                         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ provides MATERIAL MASTER DATA
              ┌────────────────┼─────────────────┐
              │                │                 │
              ▼                ▼                 ▼
        MM-02 SUPPLIER    MM-03 WAREHOUSE    MM-04 VALUATION
        MANAGEMENT             MANAGEMENT         SETUP
              │                │                 │
              └────────────────┼─────────────────┘
                               ▼
                     MM-05 PLANNING / MRP
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
           MATERIAL REQUIREMENT       REORDER REQUIREMENT
                  │                         │
                  └────────────┬────────────┘
                               ▼
                     MM-06 PROCUREMENT
                               │
                 ┌─────────────┴──────────────┐
                 ▼                            ▼
          PURCHASE REQUISITION             RFQ
                 │                            │
                 ▼                            ▼
             APPROVAL                  SUPPLIER QUOTATION
                 │                            │
                 └──────────────┬─────────────┘
                                ▼
                      QUOTATION COMPARISON
                                │
                                ▼
                         PURCHASE ORDER
                                │
                                ▼
                           PO APPROVAL
                                │
                                ▼
                            SUPPLIER
                                │
                                ▼
                       MM-07 RECEIVING
                                │
                 ┌──────────────┼───────────────┐
                 ▼              ▼               ▼
          EXPECTED RECEIPT     ASN          RECEIVING
                 └──────────────┼───────────────┘
                                ▼
                         GOODS RECEIPT
                                │
                                ▼
                    RECEIVING INSPECTION
                                │
                         ┌──────┴──────┐
                         ▼             ▼
                       PASS           FAIL
                         │             │
                         ▼             ▼
                    MM-09 PUTAWAY   MM-11 RETURN
                         │
                         ▼
                  MM-08 INVENTORY
                         │
        ┌────────────────┼────────────────────┐
        │                │                    │
        ▼                ▼                    ▼
     STOCK           RESERVATION          TRANSFER
     BALANCE              │                    │
        │                 │                    ▼
        │                 │              IN TRANSIT
        │                 │                    │
        │                 └────────┐           ▼
        │                          │     DESTINATION RECEIPT
        ▼                          ▼           │
     PICKING ←──────────────── RESERVATION ───┘
        │
        ▼
     PACKING
        │
        ▼
   GOODS ISSUE
        │
        ▼
 INVENTORY LEDGER
        │
  ┌─────┼─────────┐
  ▼     ▼         ▼
CONTROL VALUATION  AUDIT
  │       │
  ▼       ▼
COUNT   INVENTORY VALUE
  │       │
  ▼       ▼
VARIANCE FICO EVENT
  │
  ▼
ADJUSTMENT
  │
  └──────────────► INVENTORY LEDGER

MM-12 BARCODE / RFID ──► Receiving · Putaway · Picking · Counting

MM-13 SUPPLIER PERFORMANCE ◄── PO · Receipt · Quality · Returns

MM-14 REPORTS & ANALYTICS ◄── Inventory · Procurement · Warehouse · Valuation · Supplier · Control

MM-15 DASHBOARD ◄── read-only aggregation from all MM domains
```

---

## Implementation build order

```text
MM-01 MATERIAL MASTER
     │
     ├────────► MM-02 SUPPLIER
     ├────────► MM-03 WAREHOUSE
     └────────► MM-04 VALUATION
                    │
                    ▼
                 MM-05 MRP
                    │
                    ▼
                 MM-06 PROCUREMENT
                    │
                    ▼
                 MM-07 RECEIVING
                    │
                    ▼
            MM-08 INVENTORY LEDGER  ← InventoryPostingService
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       MM-09      MM-10     MM-11
      WAREHOUSE   CONTROL   RETURNS
          │         │         │
          └─────────┼─────────┘
                    ▼
                 MM-04 VALUATION
                    │
                    ▼
               FICO EVENT
                    │
                    ▼
                 MM-13 SUPPLIER PERFORMANCE
                    │
                    ▼
                 MM-14 ANALYTICS  (read-only)
                    │
                    ▼
                 MM-15 DASHBOARD  (read-only)

Cross-cutting: WORKFLOW / APPROVAL → all MM transactions
               AUDIT · EVENTS · NOTIFICATIONS
               MM-12 BARCODE/RFID → execution surfaces only
```

---

## Per-module contract

### MM-01 — Material Master

| | |
| --- | --- |
| **Creates** | Material, Material Type, Material Category, UOM, UOM Conversion, Barcode, Batch Definition, Serial Definition |
| **Consumed by** | MM-02 … MM-15 (almost all MM) |
| **Owns** | Material identity, classification, behavior |
| **Does NOT own** | Physical stock quantity, inventory movement, supplier payment, GL |

### MM-02 — Supplier Management

| | |
| --- | --- |
| **Creates** | Supplier, Supplier Category, Supplier-Material, Supplier Pricing, Payment Terms, Supplier Documents |
| **Consumes** | Material Master (MM-01) |
| **Receives from** | MM-06, MM-07, MM-10, MM-11 (performance signals) |
| **Produces** | Preferred supplier, pricing, lead time, MOQ, supplier score inputs |

### MM-03 — Warehouse Management

| | |
| --- | --- |
| **Creates** | Warehouse, Storage Type, Section, Bin, capacity rules, putaway/picking rules |
| **Consumes** | Material Master, organization, inventory balance (read) |
| **Produces** | Location, putaway/picking/packing tasks, warehouse transfer |
| **Boundary** | MM-03 = *where* · MM-08 = *how much* |

### MM-04 — Valuation

| | |
| --- | --- |
| **Creates/configures** | Valuation method, standard cost, cost layers, landed cost, price variance rules |
| **Consumes** | Material, inventory transactions, purchase prices, landed costs |
| **Produces** | Unit cost, inventory value, cost layer changes, valuation events |
| **Flows to** | FICO |

### MM-05 — Planning / MRP

| | |
| --- | --- |
| **Consumes** | Material, on-hand/available, reservations, open POs, demand, safety stock, ROP, lead time, MOQ |
| **Creates** | MRP run, material requirement, shortage, procurement suggestion |
| **Main output** | Procurement suggestion → Purchase requisition |
| **Must NOT** | Directly create inventory or post stock |

### MM-06 — Procurement

| | |
| --- | --- |
| **Creates** | PR, RFQ, supplier quotation, quotation comparison, PO, purchase contract |
| **Consumes** | MRP requirement, material, supplier, pricing, payment terms, warehouse |
| **Produces** | Purchase order → MM-07 Receiving |
| **Chain** | Requirement → PR → RFQ → Quotation → Comparison → PO |

### MM-07 — Receiving

| | |
| --- | --- |
| **Consumes** | PO, ASN, expected receipt, supplier, material, warehouse |
| **Creates** | Expected receipt, receiving record, inspection, variance, goods receipt (process), quality decision |
| **Sends to** | MM-08 Inventory, MM-09 Putaway, MM-11 Returns |
| **Pass path** | PO → Expected receipt → ASN → Receiving → Inspection → **Pass** → GR → Putaway |
| **Fail path** | **Fail** → Blocked → Supplier return |

### MM-08 — Inventory Management

| | |
| --- | --- |
| **Creates** | Inventory transaction, balance, reservation, GR/GI posting, transfer, adjustment, status change |
| **Consumes** | Material, warehouse, GR, putaway, reservations, picking, returns, counting |
| **Central engine** | `InventoryPostingService` — all physical stock changes |
| **Ledger rule** | Posted transactions are **immutable**; corrections = reversal |

### MM-09 — Warehouse execution

Operational layer on MM-03 + MM-08.

| Flow | Steps |
| --- | --- |
| Putaway | GR → Putaway task → Bin recommendation → Scan → Confirm → location update |
| Picking | Reservation → Picking task → Source bin → Scan → Confirm |
| Packing | Picked goods → Pack → Verify → Package |
| Issue | Packed → Goods issue → Ledger → Decrease |

### MM-10 — Inventory control

| | |
| --- | --- |
| **Consumes** | Balance, ledger, warehouse, material |
| **Creates** | Cycle count, physical inventory, blind count, recount, variance, adjustment approval |
| **Flow** | Inventory → Count → Blind count → Variance? → Recount → Approval → Adjustment → Ledger |

### MM-11 — Returns & disposal

| Path | Flow |
| --- | --- |
| Supplier return | Receiving failure → Blocked → Supplier return → Inventory OUT |
| Customer return | Return intake → Inspection → Disposition (restock/repair/block/scrap) |
| Disposal | Damaged/expired → Disposal request → Approval → Scrap → Ledger |

### MM-12 — Barcode / RFID

Does **not** own transactions. Routes scans to domain services → `InventoryPostingService`.

```text
Scanner → Warehouse / Receiving service → Inventory Posting Service
(not: Scanner → direct balance update)
```

### MM-13 — Supplier performance

Derived domain — consumes PO, receipt, quality, returns, price variance. Calculates on-time delivery, quality rate, return rate, price performance, lead time accuracy, supplier score.

### MM-14 — Reports & analytics

**Read-only.** Aggregates transactions, master data, ledger, valuation, supplier performance, warehouse data. Must not write back to MM operational tables.

### MM-15 — Dashboard

**Read-only aggregation.** Reads KPIs from all MM domains; every metric drills down to the owning module page.

---

## Document ownership map

| Document | Created by | Consumed by | Authoritative owner |
| --- | --- | --- | --- |
| Material | MM-01 | Almost all MM | Material Master |
| Supplier | MM-02 | Procurement, Receiving | Supplier Management |
| Warehouse / Bin | MM-03 | Inventory, Warehouse execution | Warehouse Master |
| MRP Run | MM-05 | Procurement | Planning |
| Material Requirement | MM-05 | Procurement | Planning |
| Purchase Requisition | MM-06 | RFQ, PO | Procurement |
| RFQ | MM-06 | Supplier quotation | Procurement |
| Supplier Quotation | MM-06 | Comparison, PO | Procurement |
| Purchase Order | MM-06 | Receiving, AP | Procurement |
| Expected Receipt / ASN | MM-07 | Receiving | Receiving |
| Goods Receipt (posted) | MM-08 (via posting) | Warehouse, Valuation, FICO | Inventory |
| Inspection | MM-07 | Inventory, Returns | Receiving |
| Putaway Task | MM-09 | Warehouse execution | Warehouse execution |
| Reservation | MM-08 | Picking, SD | Inventory |
| Picking Task | MM-09 | Packing | Warehouse execution |
| Packing | MM-09 | Dispatch | Warehouse execution |
| Goods Issue | MM-08 | Valuation, FICO | Inventory |
| Stock Transfer | MM-08 / MM-09 | Destination warehouse | Inventory |
| Cycle Count | MM-10 | Variance | Inventory control |
| Adjustment | MM-08 | Valuation, FICO | Inventory (MM-10 approves when required) |
| Return / Disposal | MM-11 | Inventory, FICO | Returns & disposal |
| Cost Layer | MM-04 | Valuation | Valuation |
| Supplier Score | MM-13 | Procurement (read) | Supplier performance |
| Reports / Dashboard KPIs | MM-14 / MM-15 | Users (read) | Read-only facades |

---

## Who is allowed to update what

```text
Material Master          → MM-01 owns
Supplier Master          → MM-02 owns
Warehouse Master         → MM-03 owns
Purchase Order           → MM-06 owns
Receiving process docs   → MM-07 creates process; MM-08 owns inventory posting
Inventory Transaction    → MM-08 owns (InventoryPostingService)
Inventory Balance        → MM-08 owns (derived from ledger)
Putaway / Picking / Pack → MM-09 owns tasks; MM-08 owns stock posting
Cycle Count / Variance   → MM-10 owns
Inventory Adjustment     → MM-08 posts; MM-10 approves when required
Valuation                → MM-04 owns
Returns / Disposal       → MM-11 owns
Supplier Performance     → MM-13 calculates (derived)
Reports / Dashboard      → MM-14 / MM-15 read only
Barcode scanner          → MM-12 routes only; never writes stock directly
```

---

## Central architectural rule

Do **not** treat Receiving, Warehouse, Goods Receipt, and Stock Movements as separate stock systems.

```text
                  MATERIAL (MM-01)
                     │
             ┌───────┴────────┐
             │                │
          RECEIVING        WAREHOUSE
          (MM-07/09)       (MM-03/09)
             │                │
             └───────┬────────┘
                     ▼
         INVENTORY POSTING SERVICE (MM-08)
                     │
                     ▼
             INVENTORY LEDGER (immutable)
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       BALANCE    VALUATION    AUDIT
       (MM-08)    (MM-04)     (events)
                     │
                     ▼
                    FICO
```

**One** posting service · **One** ledger · Warehouse = location/execution · Balance = current state.

---

## First three end-to-end integration flows

Use these as integration test scenarios, not page-by-page CRUD checks.

### Flow A — Purchase to stock

```text
MM-01 Material → MM-02 Supplier → MM-03 Warehouse → MM-05 Requirement
→ MM-06 PR → RFQ → Quotation → PO → MM-07 Receiving → Goods Receipt
→ Inspection → MM-09 Putaway → MM-08 Ledger → MM-04 Valuation → FICO
```

### Flow B — Stock to customer

```text
SD / Demand → MM-08 Available → Reservation → MM-09 Picking → Packing
→ Goods Issue → MM-08 Ledger → MM-04 Valuation → COGS / FICO
```

### Flow C — Inventory control

```text
MM-08 Inventory → MM-10 Cycle count → Blind count → Variance → Recount
→ Adjustment approval → MM-08 Adjustment → Ledger → MM-04 Valuation → FICO
```

---

## Agent checklist (before coding)

1. Which **MM-0x** module owns this?
2. What **document** is created? What **source** document is consumed?
3. Does it change **physical inventory**? If yes → `InventoryPostingService`.
4. Does it change **availability** only? → Reservation path, not fake stock.
5. Valuation / FICO impact?
6. Workflow / audit required?
7. Is an existing service already authoritative? **Do not duplicate.**
