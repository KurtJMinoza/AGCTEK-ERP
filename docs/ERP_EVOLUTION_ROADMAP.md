# AGCTEK ERP — Evolution Roadmap (Post–MM/SCM Depth)

**Status:** Strategic architecture direction (frozen ownership; variable maturity)  
**Parent contract:** [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md)  
**Current map:** [`CURRENT_ENTERPRISE_ARCHITECTURE.md`](./CURRENT_ENTERPRISE_ARCHITECTURE.md)

This document answers: **what to build next** now that MM and SCM are structurally strong, without redesigning MM again.

---

## 1. Maturity imbalance (current)

```text
MM    = Deep
SCM   = Deep
PP    = Integration
SD    = Integration
FICO  = Integration
CRM   = Scaffold
```

Move from **good modules** to:

```text
GOOD MODULES
      +
CLEAR OWNERSHIP          (already defined — keep)
      +
COMPLETE BUSINESS FLOWS
      +
RELIABLE CROSS-MODULE INTEGRATION
```

---

## 2. Primary implementation target

**Runnable today:** MM + SCM operational cycle (procure → stock → reserve → pick → pack → dispatch → GI → track → POD → partial FICO bridge).

**Missing commercial loop:**

```text
CRM → SD → MM → SCM → SD → FICO → CRM
```

Detailed O2C chain:

```text
CRM Lead → Opportunity → Closed Won
  → SD Sales Order → Credit → MM ATP
  → Reservation → Allocation → Picking → Packing
  → READY_FOR_DISPATCH → SCM Shipment → Dispatch → MM GI
  → IN_TRANSIT → Tracking → POD → DELIVERED
  → SD Fulfillment → SD Invoice → FICO AR/Revenue → CRM Customer History
```

**Milestone statement:**

> One real Sales Order can travel from CRM/SD → MM → SCM → delivery → SD billing → FICO accounting, while every module keeps its own ownership and no module bypasses another module's authoritative engine.

---

## 3. Master business architecture (reference)

```text
                           CUSTOMER
                              │
                              ▼
                             CRM
                    Lead / Opportunity
                              │
                         Closed Won
                              │
                              ▼
                              SD
                   Quote / Pricing / Order
                              │
                              ▼
                       Credit Check (FICO)
                              │
                              ▼
                        ATP via MM
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        STOCK AVAILABLE                  STOCK SHORTAGE
              │                               │
              │                               ▼
              │                              MRP (MM)
              │                               │
              │                        Procurement → PO → …
              │                               │
              └───────────────────────────────┘
                              │
                              ▼
                         MM INVENTORY
                              │
         Reservation → Allocation → Picking → Packing
                              │
                    READY_FOR_DISPATCH
                              │
                              ▼
                             SCM
         Shipment → Load → Route → Vehicle/Driver → Dispatch
                              │
                        MM Goods Issue
                              │
                         IN_TRANSIT → GPS / ETA → POD → DELIVERED
                              │
                ┌─────────────┼──────────────┐
                ▼             ▼              ▼
               SD            CRM            FICO
          Fulfillment      Customer       AR / Revenue
           / Billing        History
```

---

## 4. SCM ↔ MM — decouple over time

**Today:** `ScmModule` ↔ `MmModule` `forwardRef()`; trip start calls MM Goods Issue.

**Target:** outbox / typed events — not direct circular service calls:

```text
MM  → PackageReadyForDispatch → Outbox → SCM
SCM → DispatchRequested        → Outbox → MM (GI command via integration port)
MM  → GoodsIssuePosted         → Outbox → FICO / SD / SCM
SCM → ShipmentDispatched       → Outbox → SD / CRM
```

Business ownership unchanged; coupling reduced.

---

## 5. SD — commercial control layer (build order)

Do **not** add a second inventory abstraction in SD.

```text
SD-01  Customer / account integration (canonical customer identity)
SD-02  Product / catalog (sales views)
SD-03  Pricing
SD-04  Quotation
SD-05  Sales Order
SD-06  Credit / risk (FICO port)
SD-07  ATP (MM port)
SD-08  Fulfillment
SD-09  Delivery integration (SCM)
SD-10  Billing
SD-11  Returns
SD-12  Sales analytics
```

Critical path:

```text
Quote → Sales Order → Credit → ATP → Confirmation
  → Fulfillment → Delivery → Billing
```

---

## 6. Customer master — one identity

Do **not** maintain unrelated CRM Customer, SD Customer, and FICO Customer masters.

```text
                 CUSTOMER (canonical identity)
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
       CRM          SD          FICO
   relationship   selling      financial
   profile        profile      profile
```

Each module owns **view/behavior** on shared identity (contacts, addresses, credit, billing).

---

## 7. Planning — SCM forecast vs MM MRP

Two engines must not diverge:

```text
SCM                          MM
Forecast / demand signal  →  MRP / supply planning
Seasonality / logistics      Netting, reorder, safety stock
                             Procurement / PP suggestions
```

| Owner | Owns |
| --- | --- |
| **SCM** | Forecast, demand trend, logistics demand signals, capacity/logistics planning |
| **MM** | Inventory planning, MRP netting, reorder, safety stock, supply requirements |
| **PP** | BOM, production order, production execution (consumption via MM posting) |

---

## 8. PP ↔ MM (formal)

```text
Production Order → Material requirement → MM Reservation → Allocation
  → Picking → GI → Production consumes

Production Output → MM GR → InventoryPostingService → Finished goods
```

PP owns production; MM owns inventory.

---

## 9. FICO — full financial consumer (target)

Foundation today: periods, reconciliation, MM accounting consumer.

Target surface:

```text
GL · AP · AR · Credit · Tax · Cost / profit centers · Assets · Reporting
```

Integration model:

```text
MM  → inventory accounting events → FICO
SD  → billing events → FICO
SCM → logistics cost events → FICO (where applicable)
PP  → production cost events → FICO
```

FICO owns journal, AR, AP, GL, cost, profitability — not operational stock.

---

## 10. Billing trigger (explicit policy)

Separate concepts:

```text
GOODS ISSUE   = inventory leaves warehouse control
DELIVERED     = customer receives goods (POD / SCM)
INVOICE       = SD billing event → FICO
```

Configurable **billing trigger** (do not hardcode one global rule):

```text
GI · Delivery · POD · Contract milestone
```

---

## 11. Package — shared integration object

Strong handoff between MM packing and SCM logistics:

```text
Package: packageId, orderId, warehouse, items, weight, dimensions,
         barcode, label, status, shipmentId
```

```text
MM Packing → Package → READY_FOR_DISPATCH → SCM Shipment → Load → Trip → POD
```

MM must **not** know routes, trucks, or stop sequence — only package/warehouse/stock/GI.

---

## 12. Sales Order ≠ Shipment

One `SdSalesOrder` may fan out to many `ScmShipment` (partial fulfillment, backorder, split WH, split route).

---

## 13. Enterprise document flow (navigation target)

**O2C:**

```text
CRM Opportunity → SD Quote → SD SO → MM Reservation → Allocation → Pick
  → MM Package → SCM Shipment → SCM Trip → MM GI → SCM POD
  → SD Invoice → FICO Journal
```

**P2P:** (existing MM depth — link from same document-flow UX)

```text
MRP → PR → RFQ → PO → ASN → Receiving → GR → QI → Putaway → Inventory
  → Supplier invoice → 3-way match → FICO AP
```

---

## 14. Event architecture + correlation

Universal mechanism: **domain TX → outbox → typed consumer → consumer TX**.

Example fan-out:

```text
SalesOrderConfirmed      → MM
GoodsReceiptPosted       → FICO, MRP, analytics
PackageReadyForDispatch  → SCM
GoodsIssuePosted         → FICO, SD, SCM
PODCaptured              → SD, CRM, FICO (where applicable)
```

Use **`correlationId`** (e.g. `ORDER-10001`) across OpportunityWon, SO created, reservation, package, shipment, GI, invoice — for audit, support, replay, reconciliation. See `docs/MM_INTEGRATION_EVENTS.md`.

---

## 15. Status vocabulary (formalize — do not invent per screen)

| Object | States (example) |
| --- | --- |
| **Sales order** | DRAFT → CONFIRMED → PARTIALLY_FULFILLED → FULFILLED / CANCELLED |
| **Package** | CREATED → PACKED → READY_FOR_DISPATCH → DISPATCHED → DELIVERED |
| **Shipment** | DRAFT → PLANNED → ASSIGNED → DISPATCHED → IN_TRANSIT → DELIVERED / FAILED |
| **Inventory txn** | POSTED → REVERSED (immutable; no edit-in-place) |

---

## 16. Exception center — ERP-wide (evolution)

Today: MM-centric aggregation. Target: **ERP work queue** routing to owning module (CRM VIP ticket, SD credit block, MM shortage/QI hold, SCM late POD, FICO recon diff). Exception center **routes**; owners **mutate**.

---

## 17. CRM — consolidated view, not transaction owner

Agent desktop target: opportunities, SOs, invoices/balance, shipments, ETA, POD, returns, tickets — **read/consume** from SD/MM/SCM/FICO; CRM does not own those transactions.

---

## 18. Frozen architectural boundary

```text
┌─────────────────────────────────────────────────────────────┐
│ CHANNELS: Web │ POS │ Portals │ Mobile                     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ ERP MODULES: CRM │ SD │ MM │ SCM │ FICO (+ PP integration)  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ INTEGRATION: APIs │ Events │ Outbox │ Inbox │ Correlation   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ DATA: Master │ Transactions │ State │ Ledger │ Audit       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ ANALYTICS / BI / Exception dashboards                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 19. Implementation phases (recommended order)

```text
PHASE 1 — SD Core
  Customer integration · Catalog · Pricing · Quote · SO · Credit · ATP

PHASE 2 — SD Fulfillment
  Reservation/allocation hooks · Delivery · Shipment handoff · Billing foundation

PHASE 3 — SCM ↔ MM Hardening
  Package contract · Dispatch/GI · Tracking · POD · outbox decoupling

PHASE 4 — FICO Core
  GL · AR · AP · Credit · Accounting events · Reconciliation

PHASE 5 — CRM
  Customer · Lead · Opportunity · Support · RMA · Customer 360

PHASE 6 — ERP-Wide Integration
  Event contracts · Document flow · Exception center · Correlation · Replay
```

**Stop doing:** serial MM enhancement while SD/FICO/CRM remain scaffold. **Start doing:** vertical slices on the O2C milestone above.

---

## 20. Repo alignment (today)

| Strength | Evidence |
| --- | --- |
| MM inventory spine | `InventoryPostingService`, ATP, MRP non-posting |
| MM ↔ SCM handoff | `READY_FOR_DISPATCH`, shipments from package, GI on trip start |
| SD / PP / FICO ports | `backend/src/sd`, `pp`, `fico` + MM integration folders |
| Events foundation | Outbox patterns, `MM_INTEGRATION_*` docs |

Next code work should land in **Phase 1 SD Core** and **event contracts** for SCM↔MM decoupling — not new MM-16 domains.
