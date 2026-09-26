# AGCTEK ERP — Master Enterprise System Flow

**Status:** Canonical enterprise architecture contract  
**Audience:** Architects, agents, implementers, reviewers  
**Relationship to code:** Describes the target enterprise flow and ownership model. It **fits** the current repository (MM deep, SCM logistics, SD/PP/FICO integration ports, MM→SCM handoff) and constrains future CRM / full O2C / AP work — it does **not** invent a greenfield stack.

| Layer | Role |
| --- | --- |
| **This document** | **WHAT** the ERP business system is (flows, ownership, forbidden overlaps) |
| [`AGENTS.md`](../AGENTS.md) | **HOW** agents inspect, change, and validate the repo |
| Skills / `MM_*` docs | Domain depth (MM posting, MRP, quality, integration) |
| Repository | Authoritative implementation |

### Principles (top of every Skill)

```text
CRM = CUSTOMER RELATIONSHIP
SD  = COMMERCIAL ORDER
MM  = MATERIAL + INVENTORY
SCM = PHYSICAL MOVEMENT
FICO = FINANCIAL EFFECT
```

```text
ONE DATA MODEL
ONE OWNER PER BUSINESS CONCEPT
ONE INVENTORY POSTING ENGINE
ONE ATP AUTHORITY
ONE MRP ENGINE
ONE EVENT / OUTBOX CONTRACT
ONE WORKFLOW ENGINE
ONE AUDIT TRAIL
NO DUPLICATE BUSINESS LOGIC
```

---

## 1. Core ERP architecture

```text
                         CHANNELS / CLIENTS
 ┌──────────────────────────────────────────────────────────────┐
 │ Web ERP │ POS │ Customer Portal │ Supplier Portal │ Mobile │
 └──────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │     ERP API LAYER     │
                    │ NestJS + Fastify      │
                    │ Auth / Validation     │
                    │ Authorization / Scope │
                    └───────────┬───────────┘
                                │
             ┌──────────────────┼───────────────────┐
             ▼                  ▼                   ▼
           CRM                  SD                  MM
             │                  │                   │
             │                  │                   │
             │                  ▼                   ▼
             │             Sales / O2C       Inventory / P2P
             │                  │                   │
             │                  └────────┬──────────┘
             │                           ▼
             │                          SCM
             │                           │
             │                           ▼
             │                        Delivery
             │                           │
             └───────────────────────────┼───────────────┐
                                         ▼               │
                                        FICO              │
                                         │                │
                                         ▼                │
                                  Financial Results ◄─────┘
```

**Repo today:** MM is the deepest domain; SCM owns logistics/telematics; SD and PP orchestrate with MM; FICO consumes accounting events. CRM is a defined ownership layer (future / partial) and must not write inventory.

---

## 2. CRM → SD

```text
CRM
 │
 ├─ Lead
 ├─ Campaign
 ├─ Opportunity
 ├─ Customer / Account
 └─ Support
        │
        ▼
 Qualification
        │
        ▼
 Proposal / Quote
        │
        ▼
 Negotiation
        │
        ▼
 CLOSED WON
        │
        ▼
 SD Sales Order
```

CRM owns relationship and opportunity. **Closed Won** hands off to SD for formal Sales Order creation.

### 2.1 Canonical customer identity

One ERP customer — not three unrelated masters:

```text
Customer (identity, contacts, addresses)
  ├── CRM profile (relationship, pipeline, support context)
  ├── SD profile (commercial, pricing, delivery preferences)
  └── FICO profile (credit, AR, payment terms)
```

CRM displays consolidated history (SO, shipment, invoice, POD) but **does not own** those transactions.

---

## 3. SD order-to-cash

```text
Sales Order
    │
    ▼
Pricing
    │
    ▼
Credit Check ─────────────► FICO
    │
    ▼
ATP Check ────────────────► MM
    │
    ▼
Order Confirmation
    │
    ▼
Fulfillment
    │
    ▼
Delivery / Shipment
    │
    ▼
Billing
    │
    ▼
AR / Revenue ─────────────► FICO
```

SD owns pricing, order management, and billing. MM provides availability. FICO provides credit and accounting services.

**SD Sales Order ≠ SCM Shipment** — one order may split into multiple shipments (partial fulfillment, backorder, warehouses, routes).

**Billing policy (configurable):** distinguish **Goods Issue** (inventory), **Delivered** (POD), and **Invoice** (SD → FICO). Triggers may be GI, delivery, POD, or contract milestone — not one hardcoded global rule.

---

## 4. MM ATP

```text
SD Order
   │
   ▼
MM Availability Service
   │
   ├── Unrestricted On-Hand
   ├── Reserved
   ├── Restricted Stock
   └── Expected Supply
   │
   ▼
ATP
```

### Authoritative formula (implemented)

```text
Available = Unrestricted On-Hand − Reserved
```

Restricted statuses are excluded from ATP. The React UI **must not** recompute ATP authoritatively.

Canonical service: `InventoryAvailabilityService` (`backend/src/mm/inventory/`).

---

## 5. ATP decision

```text
                     ATP
                      │
             ┌────────┴─────────┐
             │                  │
         SUFFICIENT          SHORTAGE
             │                  │
             ▼                  ▼
       Reservation             MRP
             │                  │
             │                  ▼
             │              Requirements
             │                  │
             │                  ▼
             │             Procurement
             │                  │
             │                  ▼
             │                Supply
             │                  │
             └──────────────────┘
```

```text
SD = demand
MM ATP = availability
MM MRP = supply requirement
```

---

## 6. MRP

```text
                    DEMAND
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
      SD              PP          Maintenance / Projects
       │               │                │
       └───────────────┼────────────────┘
                       ▼
              Demand Aggregation
                       │
                       ▼
                MRP Scope Loader
                       │
                       ▼
                  MRP Engine
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Inventory       Open PO         Reservations
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                Projected Stock
                       │
                       ▼
                Net Requirement
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        No Shortage           Shortage
                                 │
                                 ▼
                           Planned Order
                                 │
                        ┌────────┴─────────┐
                        ▼                  ▼
                 Procurement          Production
                   Suggestion          Requirement
```

### Permanent rule

```text
MRP NEVER POSTS INVENTORY.
```

Detail: `.cursor/skills/mrp/SKILL.md`, `docs/MM_MRP_ARCHITECTURE.md`.

---

## 7. MM procure-to-stock

```text
MRP / Manual Requirement
          │
          ▼
Purchase Requisition
          │
          ▼
PR Approval
          │
          ▼
RFQ
          │
          ▼
Supplier Quotations
          │
          ▼
Quotation Comparison
          │
          ▼
Supplier Selection
          │
          ▼
Purchase Order
          │
          ▼
PO Approval
          │
          ▼
Supplier
          │
          ▼
ASN / Expected Receipt
          │
          ▼
Receiving
          │
          ▼
Goods Receipt
```

---

## 8. Receiving + Quality

```text
Goods Receipt
      │
      ▼
Inspection Required?
      │
 ┌────┴───────┐
 │            │
 NO           YES
 │            │
 ▼            ▼
Putaway    Inspection Lot
              │
              ▼
        Inspection Plan
              │
              ▼
           Sampling
              │
              ▼
      Inspection Results
              │
        ┌─────┴─────┐
        ▼           ▼
       PASS        FAIL
        │            │
        ▼            ▼
 Usage Decision    Defect / NC
        │            │
 ┌──────┼──────┐     ▼
 ▼      ▼      ▼   Quality Hold
ACCEPT REWORK  RETURN
 │       │        │
 ▼       ▼        ▼
Stock   Rework   Supplier Return
```

Quality decides **whether** stock may be used; inventory owns quantity/movement via `InventoryPostingService`.

---

## 9. Inventory Core — single source of physical truth

```text
                         BUSINESS OPERATION
                                │
                                ▼
                         DOMAIN SERVICE
                                │
                                ▼
                   InventoryPostingService
                                │
                    Serializable DB Transaction
                                │
                                ▼
                  MmInventoryTransaction
                       IMMUTABLE LEDGER
                                │
                                ▼
                     MmInventoryBalance
                       CURRENT STATE
                                │
             ┌──────────────────┼─────────────────┐
             ▼                  ▼                 ▼
        Valuation              Audit            Events
             │                                      │
             ▼                                      ▼
          Accounting                         Integration Consumers
             │
             ▼
            FICO
```

```text
Receiving ──────┐
Warehouse ──────┤
Returns ────────┤
Adjustments ────┤
Goods Issue ────┤──► InventoryPostingService
Quality ────────┤
Scanner ────────┘
```

**No alternate inventory engine.** Canonical path: `backend/src/mm/inventory/inventory-posting.service.ts`.

---

## 10. MM reservation / allocation

```text
Sales / Production Requirement
            │
            ▼
          ATP
            │
            ▼
       Reservation
            │
            ▼
        Allocation
            │
      ┌─────┴─────────┐
      ▼               ▼
     FIFO             FEFO
      │               │
      └──────┬────────┘
             ▼
        Physical Stock
             │
             ▼
          Pick Task
```

Reservation = commitment. Allocation = selecting specific physical inventory. **Neither** reduces physical on-hand; Goods Issue does.

---

## 11. Warehouse execution

```text
                     WAREHOUSE
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     PUTAWAY           PICKING        TRANSFER
        │                │                │
        │                ▼                │
        │             PACKING             │
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                 READY_FOR_DISPATCH
```

### Putaway

```text
GR → Putaway Task → Bin Recommendation → Source Scan → Destination Scan → Confirm → Bin Updated
```

### Picking

```text
Allocation → Pick Task → Source Bin → Material / Batch / Serial Scan → Qty Confirm → Picked
```

### Packing

```text
Picked Goods → Packing Session → Scan / Verify → Package → Weight / Dimensions → Label → READY_FOR_DISPATCH
```

Picking must **not** reduce on-hand until Goods Issue.

---

## 12. MM → SCM handoff

```text
MM
 │
 ├── Picking
 ├── Packing
 ├── Package Creation
 └── Weight / Dimensions
          │
          ▼
   READY_FOR_DISPATCH
          │
          ▼
        SCM
```

Implemented process: `docs/SCM_PROCESS_FLOW.md` (`PackingService.markReadyForDispatch` → SCM shipment).

---

## 13. SCM logistics flow

```text
READY_FOR_DISPATCH
        │
        ▼
Shipment Creation
        │
        ▼
Order Pooling / Consolidation
        │
        ▼
Volume + Weight
        │
        ▼
Load Building
        │
        ▼
Route Optimization
        │
        ▼
Time Windows / Constraints
        │
        ▼
Vehicle Selection
        │
        ▼
Driver Assignment
        │
        ▼
Load Manifest
        │
        ▼
Dispatch
        │
        ▼
IN_TRANSIT
        │
        ▼
GPS / Telematics
        │
        ▼
ETA / Exception Monitoring
        │
        ▼
Arrival
        │
        ▼
POD
        │
        ▼
DELIVERED
```

---

## 14. Driver and vehicle ownership (no HCM)

```text
SCM
│
├── Driver Master
│   ├── Availability
│   ├── Qualification
│   ├── License
│   └── Assignment
│
└── Vehicle Master
    ├── Capacity
    ├── Weight
    ├── Volume
    ├── Status
    └── Maintenance
```

---

## 15. MM Goods Issue + SCM

```text
SCM Dispatch / Trip Start
      │
      ▼
MM Goods Issue
      │
      ▼
InventoryPostingService
      │
      ├── Inventory decreases
      ├── Ledger transaction
      ├── Valuation
      ├── Audit
      └── Accounting event → FICO (COGS)
              │
              ▼
Package DISPATCHED → SCM IN_TRANSIT
```

SCM must **not** decrease MM inventory directly; it calls MM services (e.g. `GoodsIssueService`).

---

## 16. SCM → SD

```text
SCM
 │
 ├── Shipment Dispatched
 ├── ETA Updated
 ├── Delivery Exception
 ├── POD Captured
 └── Delivery Completed
        │
        ▼
       SD
        │
 ├── Fulfillment Status
 ├── Customer Order Status
 └── Billing Trigger
```

---

## 17. SCM → CRM

```text
SCM
 │
 ├── Shipment Status
 ├── ETA
 ├── Tracking
 ├── Delivery Exception
 └── POD
        │
        ▼
       CRM
        │
 ├── Customer 360
 ├── Support Context
 ├── Customer Notifications
 └── Delivery History
```

---

## 18. SD billing → FICO

```text
Delivery / Billing Trigger → SD Invoice → FICO → AR + Revenue
```

---

## 19. MM → FICO

```text
                  MM
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
      GR           GI       Adjustment
       │           │            │
       └───────────┼────────────┘
                   ▼
          Valuation Engine
                   │
                   ▼
          MmAccountingEvent
                   │
                   ▼
              FICO Consumer
                   │
                   ▼
                 GL
```

MM does **not** write FICO GL directly.

---

## 20. Supplier invoice / AP

```text
PO + Goods Receipt + Supplier Invoice → Three-Way Match → AP (FICO) / Exception hold → Payment
```

---

## 21. Customer returns

```text
CRM RMA → SD Return Authorization → MM Return Receiving → Quality → Disposition
  (RESTOCK / REPAIR / BLOCK / SCRAP) → InventoryPostingService → FICO event
```

---

## 22. Supplier returns

```text
PO → GR → QI REJECT → Quality Hold → Supplier Return → RETURN_OUT
  → InventoryPostingService → FICO / AP adjustment
```

---

## 23. Inventory control

```text
Count Policy → Plan → Session → Blind Count → Variance → Recount
  → Adjustment Request → Approval → InventoryPostingService
  → COUNT_GAIN / COUNT_LOSS → Valuation → FICO
```

Detection/approval lives in Inventory Control; physical posting is only via `InventoryPostingService`.

---

## 24. Batch / serial traceability

```text
Supplier → PO → GR → Inspection → Batch/Serial → Warehouse → Transfer
  → Production / Issue → Shipment → Customer
```

Queries (from ledger/document history — not a second stock history): batch forward/backward, where-used, serial history, location history, document history.

---

## 25. Exception management

```text
                 MM EXCEPTION CENTER (read-only aggregation)
                         │
 ┌─────────┬─────────────┼──────────────┬──────────┐
 ▼         ▼             ▼              ▼          ▼
 SD        MM           SCM            FICO       CRM
```

Routes users to the **owning** screen; does not mutate owning records.

---

## 26. Event-driven integration

```text
Business Transaction → DB Transaction → Business Record + Outbox Event
  → Event Layer → SD / SCM / FICO / CRM consumers
```

Prefer: domain transaction → outbox → typed event → consumer → consumer-owned transaction.

**SCM ↔ MM decoupling target:** replace long-term `forwardRef` + direct GI injection with:

```text
MM → PackageReadyForDispatch → SCM
SCM → DispatchRequested / ShipmentDispatched → MM integration port / SD / CRM
MM → GoodsIssuePosted → FICO / SD / SCM
```

**Correlation:** propagate `correlationId` (and `causationId`) on all events in one commercial or procurement process for audit, support, and replay.

---

## 27. Integration event examples

```text
CRM → SD: OpportunityWon, CustomerUpdated
SD → MM: SalesOrderConfirmed, SalesOrderCancelled, SalesDemandChanged
MM → SD: ATPUpdated, ReservationCreated, AllocationCreated, GoodsIssuePosted
MM → SCM: PackageReadyForDispatch, ShipmentReady
SCM → SD: ShipmentDispatched, ETAUpdated, PODCaptured, DeliveryCompleted
SCM → CRM: ShipmentStatusChanged, ETAUpdated, DeliveryCompleted
MM → FICO: GoodsReceiptPosted, GoodsIssuePosted, InventoryAdjusted, ScrapPosted,
           SupplierReturnPosted, ValuationUpdated, LandedCostAllocated
SD → FICO: InvoiceCreated, CreditMemoCreated
```

Contracts: `docs/MM_INTEGRATION_CONTRACTS.md`, `.cursor/skills/integration/SKILL.md`.

---

## 28. Cross-cutting transaction pipeline

```text
User / API / Event
  → Authentication → Authorization → Organization Scope → DTO Validation
  → Business Rule Validation → Workflow / Approval → Concurrency Control
  → Database Transaction → Domain State Change → Audit → Outbox Event
  → Consumer Processing
```

---

## 29. Data architecture

```text
MASTER DATA → TRANSACTIONAL DATA → OPERATIONAL STATE
  (Inventory / Orders / Shipments)
  → IMMUTABLE HISTORY (Ledger / Audit / Events) → ANALYTICS / BI
```

Prisma/PostgreSQL monorepo: largest model surface is MM (`Mm*`, `Wm*`); SCM and org/platform models alongside.

---

## 30. What each module owns

| Module | Owns |
| --- | --- |
| **CRM** | Lead, Opportunity, Customer relationship, Campaign, Support, RMA initiation |
| **SD** | Quote, Pricing, Sales Order, Credit process, Billing, O2C |
| **MM** | Material, Supplier, Procurement, Receiving, Quality, Inventory, Warehouse, Reservation, Allocation, Picking, Packing, Valuation, Returns, Stock control |
| **SCM** | Shipment, Load, Route, Vehicle, Driver, Dispatch, Trip, GPS, Tracking, POD |
| **FICO** | GL, AP, AR, Credit, Accounting, Cost control, Financial reporting |
| **PP** | Production orders / BOM (demand & explosion for MRP; not inventory posting) |

---

## 31. What modules must NOT do

```text
CRM
❌ Do not write inventory

SD
❌ Do not write inventory directly
❌ Do not maintain a second ATP calculation

MM
❌ Do not write FICO GL directly
❌ Do not own route optimization
❌ Do not own customer support

SCM
❌ Do not directly decrease MM inventory
❌ Do not post revenue

FICO
❌ Do not become the operational inventory engine

MRP
❌ Do not post inventory

Warehouse / Scanner
❌ Do not directly manipulate inventory balance
❌ Do not bypass domain services
```

---

## 32. Final master business cycle

```text
CUSTOMER / MARKET → CRM → SD (Quote / Pricing / Credit) → SALES ORDER → ATP
  ├── AVAILABLE → Reservation → Allocation → Picking → Packing → READY_FOR_DISPATCH
  └── SHORTAGE → MRP → Procurement → PO → Supplier → Receiving + QI → Putaway → Inventory
        → SCM (plan / load / route / driver / vehicle) → Dispatch → MM Goods Issue
        → IN_TRANSIT → GPS → POD → DELIVERED
        → SD (fulfillment / billing) · CRM (customer 360) · FICO (AR / Revenue)
        → next demand cycle → MRP
```

---

## 33. Implementation map (current repo)

| Concern | Location |
| --- | --- |
| API bootstrap | `backend/src/main.ts` (`/api/v1`) |
| Module registration | `backend/src/app.module.ts` |
| MM posting engine | `backend/src/mm/inventory/inventory-posting.service.ts` |
| MM module | `backend/src/mm/mm.module.ts` |
| SCM module | `backend/src/scm/` |
| MM→SCM process | `docs/SCM_PROCESS_FLOW.md` |
| MM architecture detail | `docs/MM_ARCHITECTURE.md` |
| Agent operating rules | `AGENTS.md` |
| Web navigation | `src/configs/erp-modules.ts` |
| Driver mobile | `apps/driver/` |

When code and this contract disagree on an **invariant** (posting, ATP owner, MRP non-posting, event ownership), **fix the code** or escalate — do not silently invent a second engine.

---

## 34. Package as MM↔SCM integration object

MM owns packing and package state; SCM owns shipment, route, trip, fleet, POD. **Package** carries the handoff (items, weight, barcode, label, status, optional `shipmentId`). MM announces readiness; SCM plans transport — MM does not assign routes or vehicles.

---

## 35. SCM forecast vs MM MRP

SCM may emit **demand / forecast signals**; MM **MRP** performs netting, safety stock, and supply proposals. PP supplies BOM/production demand. Do not build two independent supply planning engines.

---

## 36. Evolution roadmap (what to build next)

MM and SCM are **deep enough to treat as stable**. Primary target: full **CRM → SD → MM → SCM → SD → FICO → CRM** cycle on one real Sales Order. Phased plan: SD Core → SD Fulfillment → SCM↔MM hardening → FICO Core → CRM → ERP-wide document flow / exceptions / correlation.

Detail: [`ERP_EVOLUTION_ROADMAP.md`](./ERP_EVOLUTION_ROADMAP.md).

---

## 37. Master E2E acceptance scenario

The **single most important integration test** for the ERP: one Sales Order from CRM Closed Won through SD, MM, SCM, delivery, SD billing, FICO AR, and CRM customer history — with post-conditions on inventory ledger, reservations, POD, COGS, invoice, and event correlation.

Canonical script: [`MASTER_E2E_SALES_ORDER_SCENARIO.md`](./MASTER_E2E_SALES_ORDER_SCENARIO.md).
