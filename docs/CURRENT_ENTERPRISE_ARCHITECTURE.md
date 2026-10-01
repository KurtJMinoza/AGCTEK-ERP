# AGCTEK ERP — Current Enterprise Architecture (Detailed)

**Status:** Living architecture map of the **current repository**  
**Parent contract:** [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md)  
**Date context:** Branch `mm` / product AGCTEK ERP monorepo

This document answers: **what each module owns, how value flows today, what is implemented vs scaffolded, and how modules integrate.**

---

## 0. Maturity legend

| Level | Meaning |
| --- | --- |
| **Deep** | Full-stack (API + UI + data) in active use |
| **Integration** | Backend orchestration / events / ports exist; UI may be thin |
| **Nav scaffold** | ERP hub navigation exists; little or no domain API/UI |
| **Planned** | Defined in master flow only |

| Module | Maturity | Primary paths |
| --- | --- | --- |
| **MM** | **Deep** | `backend/src/mm/`, `src/modules/mm/` |
| **SCM** | **Deep** (logistics + telematics) | `backend/src/scm/`, `src/modules/scm/`, `apps/driver/` |
| **SD** | **Integration** | `backend/src/sd/` · nav in `erp-modules.ts` · no `src/modules/sd` |
| **PP** | **Integration** | `backend/src/pp/` (BOM / production orders for MM MRP) |
| **FICO** | **Integration** | `backend/src/fico/` · nav scaffold · MM accounting consumer |
| **CRM** | **Nav scaffold** | Nav only · no `backend/src/crm` · no `src/modules/crm` |

**Strategic posture:** MM and SCM are **deep enough to freeze**; do not redesign MM again. The imbalance is maturity across modules — next work is **cross-module business cycles**, not more MM surface area. See [`ERP_EVOLUTION_ROADMAP.md`](./ERP_EVOLUTION_ROADMAP.md).

**Primary ERP milestone & acceptance test:**

> One real Sales Order travels **CRM/SD → MM → SCM → delivery → SD billing → FICO**, with clear module ownership and no bypass of authoritative engines (inventory, ATP, GL).

Full scenario + post-conditions: [`MASTER_E2E_SALES_ORDER_SCENARIO.md`](./MASTER_E2E_SALES_ORDER_SCENARIO.md).

**Runnable today vs target:**

| Cycle | Status |
| --- | --- |
| MM + SCM operational (PR→PO→GR→…→GI→POD) | **Runnable** |
| CRM → SD → MM → SCM → SD → FICO → CRM commercial loop | **Primary implementation target** |

---

## 1. Platform stack

```text
┌─────────────────────────────────────────────────────────────────┐
│ Channels                                                         │
│  Web ERP (Next.js :3010)  ·  Driver Expo app  ·  Telematics     │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / Socket.IO / MQTT
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ NestJS + Fastify API (:3011)  prefix /api/v1                     │
│ Auth · Validation · CORS · Multipart · EventEmitter · Prisma     │
└───────────────────────────────┬─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ PostgreSQL (Prisma)  ~200 models  Mm* / Wm* / Org / SCM / SD…  │
└─────────────────────────────────────────────────────────────────┘
```

| Concern | Location |
| --- | --- |
| App module graph | `backend/src/app.module.ts` — Auth, Notifications, Scm, Mm, Sd, Pp, Fico |
| API bootstrap | `backend/src/main.ts` |
| Web navigation SSOT | `src/configs/erp-modules.ts` (+ `erp-modules/mm.module.ts`) |
| Axios | `src/services/axios/ErpAxiosBase.ts` → `${NEXT_PUBLIC_API_BASE_URL}/api/v1` |
| Auth (web) | NextAuth `src/auth.ts` |
| Agent contract | `AGENTS.md` + master flow |

Registered Nest domains: **auth, notifications, mm, scm, sd, pp, fico, prisma**.

Frontend domain modules present: **mm, scm, account, home, notifications** (not crm/sd/fico pages yet).

---

## 2. Enterprise ownership (canonical)

```text
CRM = CUSTOMER RELATIONSHIP     (relationship, pipeline, RMA initiation)
SD  = COMMERCIAL ORDER          (quote, SO, pricing, billing / O2C)
MM  = MATERIAL + INVENTORY      (P2P, stock, WH, MRP, valuation)
SCM = PHYSICAL MOVEMENT         (shipment, trip, fleet, GPS, POD)
FICO = FINANCIAL EFFECT         (GL/AP/AR, periods, journals from events)
PP  = PRODUCTION / BOM          (demand + BOM for MRP; not inventory writer)
```

**Hard rules (all modules):**

- One inventory posting engine → `InventoryPostingService`
- One ATP authority → `InventoryAvailabilityService`
- MRP never posts inventory
- SCM never decreases stock directly (calls MM Goods Issue)
- MM never writes FICO GL directly (emits `MmAccountingEvent`)
- CRM / SD never write inventory

---

## 3. Master end-to-end business cycle (target + current wiring)

```text
MARKET / CUSTOMER
       │
       ▼
┌─────────────┐     Closed Won (planned)
│     CRM     │ ──────────────────────────► ┌─────────────┐
│  (scaffold) │                             │     SD      │
└─────────────┘                             │ Integration │
                                            │  Sales Order│
                                            └──────┬──────┘
                                                   │ confirm → events / ATP / reserve
                                                   ▼
                                            ┌─────────────┐
                                            │     MM      │
                                            │    DEEP     │
                                            │ ATP · Res   │
                                            │ Pick · Pack │
                                            └──────┬──────┘
                                                   │ READY_FOR_DISPATCH
                                                   ▼
                                            ┌─────────────┐
                                            │     SCM     │
                                            │    DEEP     │
                                            │ Ship · Trip │
                                            │ GPS · POD   │
                                            └──────┬──────┘
                                                   │ trip start → MM GI
                                                   │ deliver → status
                     ┌─────────────────────────────┼────────────────┐
                     ▼                             ▼                ▼
              ┌─────────────┐              ┌─────────────┐   ┌─────────────┐
              │     SD      │              │     CRM     │   │    FICO     │
              │  billing*   │              │  360 / ETA* │   │ Integration │
              └─────────────┘              └─────────────┘   │ AR / COGS*  │
                     * partial / planned                       └─────────────┘
```

**Also always running in parallel (MM-centric):**

```text
Shortage / MRP → PR → RFQ → PO → ASN → Receiving → QI → Putaway → Stock
Count / Adjust / Return / Valuation → posting → MmAccountingEvent → FICO
```

---

# 4. Sales & Distribution (SD)

## 4.1 Role

Commercial **order-to-cash** owner: pricing, sales order, credit (via FICO), fulfillment status, billing. Does **not** own physical stock or ATP math.

## 4.2 Target O2C flow

```text
Sales Order → Pricing → Credit Check (FICO) → ATP Check (MM)
  → Confirmation → Fulfillment → Delivery/Shipment (SCM)
  → Billing → AR / Revenue (FICO)
```

## 4.3 Current implementation

| Layer | Status |
| --- | --- |
| Navigation | Full hub under `/modules/sd` (customer master, SO, deliveries, billing, reports, config) |
| Frontend module | **Not present** (`src/modules/sd` missing) — landing uses generic ERP cards |
| Backend | `backend/src/sd/` — sales order CRUD + confirm/cancel/issue orchestration |

**Backend capabilities today:**

- `SalesOrderService` — create DRAFT SO + lines, confirm, cancel, change line qty, issue path
- `SdEventEmitterService` / `SdMmEventConsumer` / `SdMmOrchestrationService` — MM integration
- Prisma: `SdSalesOrder` (+ lines)

**Typical confirm path (integration):**

```text
SD confirm
  → emit SD events
  → MM reservation / orchestration (SdMmOrchestrationService)
  → later WH pick/pack → SCM → GI
```

## 4.4 SD must not

- Write `MmInventoryBalance` or call alternate stock engines  
- Recompute ATP in UI  
- Own fleet / POD (SCM) or GL postings (FICO)

## 4.5 Nav surface (planned UI)

Master: Customer Master, Material Sales View, Pricing Conditions  
Transactional: Sales Orders, Deliveries, Billing  
Reports: Sales Analysis, Backorder  
Config: Sales Org, Document Types  

---

# 5. Materials Management (MM)

## 5.1 Role

**Deepest operational domain.** Owns materials, suppliers, procurement, receiving/quality, inventory truth, warehouse execution, MRP (planning only), valuation, returns, barcode/mobile, analytics.

## 5.2 Inventory invariant (non-negotiable)

```text
Business Operation
  → Domain Service (GR / GI / Adjust / Transfer / Count post / Return …)
  → InventoryPostingService
  → MmInventoryTransaction (immutable ledger)
  → MmInventoryBalance (derived)
  → ValuationEngine (when cost-relevant)
  → Audit + Domain Events
  → MmAccountingEvent → FICO consumer
```

**ATP:** `Available = Unrestricted On-Hand − Reserved`  
Restricted statuses excluded. UI must not recompute.

## 5.3 Domain map MM-01 … MM-15

| ID | Domain | Backend | Frontend |
| --- | --- | --- | --- |
| MM-01 | Material Master | materials, uom, barcodes, batches, serials | `material-master/` |
| MM-02 | Supplier | `supplier/` | `supplier-management/` |
| MM-03 | Org + WH master | org, warehouse masters | `organization/`, `warehouse/` |
| MM-04 | Valuation | `valuation/` + FIFO/MAP/Standard | `valuation/` |
| MM-05 | Planning / MRP | `planning/` | `planning/` |
| MM-06 | Procurement | PR, RFQ, PO, contracts, workflow | `procurement/`, `three-way-match/` |
| MM-07 | Receiving / Quality | inbound, receiving, quality | `receiving/` |
| MM-08 | Inventory core | inventory, stock-ops | `inventory/` |
| MM-09 | WH execution | putaway/pick/pack/tasks/transfers, STO | `warehouse/`, `stock-transfer/` |
| MM-10 | Inventory control | count engine | `inventory-control/` |
| MM-11 | Returns / disposal | returns-disposal, traceability | `returns-disposal/` |
| MM-12 | Barcode / mobile | `scanner/` | `barcode-rfid/` |
| MM-13 | Supplier performance | `supplier-performance/` | `supplier-performance/` |
| MM-14 | Reports / analytics | reports, analytics | `reports-analytics/` |
| MM-15 | Dashboard | `dashboard/` | `dashboard/` |

Cross-cutting: `common/` (scope, events, idempotency), `document-flow/`, `exception-center/`, `integration/{sd,production,fico,demand}/`.

## 5.4 Procure-to-stock flow (implemented)

```text
MRP / Manual demand
  → Purchase Requisition (+ approval workflow)
  → RFQ → Supplier Quotations → Comparison → Award
  → Purchase Order (+ approval)
  → ASN / Expected Receipt
  → Receiving Workbench
  → Goods Receipt ──► InventoryPostingService
  → Inspection? → QI Lot → Usage Decision / Hold / Return
  → Putaway → Bin stock
```

## 5.5 Order-to-issue (outbound, with SCM)

```text
Demand (SD / reservation)
  → ATP → Reservation (no physical decrease)
  → Allocation (FIFO / FEFO)
  → Pick task → Pack → Package
  → READY_FOR_DISPATCH ──► SCM Shipment
  → (SCM trip start) Goods Issue ──► InventoryPostingService
  → Package DISPATCHED
```

## 5.6 Inventory control flow

```text
Policy → Plan → Session → Count / Blind → Variance → Recount
  → Adjustment request → Approval → InventoryPostingService
  → COUNT_GAIN / COUNT_LOSS → Valuation → FICO event
```

## 5.7 MRP flow (planning only)

```text
Demand (SD / PP / manual) → Aggregate → Scope Loader → MRP Engine
  → net vs inventory / open PO / reservations
  → Projected stock → Net requirement → Planned order / PR suggestion
```

**MRP NEVER POSTS INVENTORY.**

## 5.8 Quality flow

```text
GR → Inspection required?
  NO → Putaway
  YES → Lot → Plan → Sample → Results → PASS/FAIL
        → Usage decision (ACCEPT / REWORK / RETURN) or Hold / NC
        → stock status/movement only via InventoryPostingService
```

## 5.9 Frontend hubs (`/modules/mm/…`)

Organization · Material Master · Supplier Management · Procurement · Receiving · Inventory Management · Warehouse Management · Inventory Control · Planning/MRP · Valuation · Returns · Barcode/RFID · Reports · Dashboard · Exception Center  

Lazy refs: `src/modules/mm/shared/useLazyMmRefs.ts`.

---

# 6. Finance & Controlling (FICO)

## 6.1 Role

Financial effect of operations: GL, AP, AR, credit, periods, cost controlling. Consumes MM/SD accounting events; **not** the operational inventory engine.

## 6.2 Target flows

```text
MM GR / GI / Adjust / Scrap / Return / Valuation
  → MmAccountingEvent → FICO Consumer → Journal / GL

SD Invoice → FICO AR / Revenue
PO + GR + Supplier Invoice → 3-way match (MM) → FICO AP / Payment
SD Credit check → FICO credit services
```

## 6.3 Current implementation

| Layer | Status |
| --- | --- |
| Navigation | Full hub: CoA, cost/profit centers, journals, AP, AR, statements, fiscal config |
| Frontend module | **Not present** |
| Backend | Periods API, reconciliation, accounting consumer, journal service, financial period port for MM |

**API today (`/api/v1/fico`):**

- `GET/POST periods`, `PATCH periods/status`
- `GET reconciliation` (inventory ↔ accounting reconciliation aids)

**Integration:**

- `FicoAccountingConsumerService` consumes MM accounting outbox  
- `FINANCIAL_PERIOD_PORT` — MM posting respects open/closed periods  
- `FicoJournalService` / `FicoReconciliationService`

## 6.4 FICO must not

Become source of truth for on-hand qty or bypass MM posting.

---

# 7. Customer Relationship Management (CRM)

## 7.1 Role

Customer relationship layer: leads, accounts, contacts, opportunities, campaigns, activities, support context, RMA **initiation**. Hands **Closed Won** to SD for Sales Order. Displays logistics status from SCM (ETA, POD) — does not run fleet.

## 7.2 Target flow

```text
Lead → Qualify → Opportunity → Quote/Proposal → Negotiate → CLOSED WON
  → SD Sales Order

Support / RMA request → SD return auth → MM return receiving → QI → disposition
```

## 7.3 Current implementation

| Layer | Status |
| --- | --- |
| Navigation | Full hub under `/modules/crm` |
| Backend | **None** (`backend/src/crm` missing) |
| Frontend | **None** (`src/modules/crm` missing) |

**Nav surface (scaffold):** Accounts, Contacts, Leads · Opportunities, Activities, Campaigns · Pipeline Analytics, Customer Insights · Sales Stages, Lead Sources  

Treat CRM as **planned ownership** constrained by the master flow; do not invent inventory or SO engines inside CRM.

---

# 8. Supply Chain Management (SCM)

## 8.1 Role

Physical movement after warehouse release: shipments, load building, trips, vehicles, drivers, maintenance, GPS/telematics, geofences, POD. Drivers/vehicles live in SCM (**no HCM**).

## 8.2 Logistics flow (implemented MVP)

```text
MM Package READY_FOR_DISPATCH
  → SCM Shipment READY (idempotent createFromPackage)
  → Load plan (multi-select READY) → Trip DRAFT / PLANNED
  → Dispatch → Trip ASSIGNED
  → Start trip → MM GoodsIssueService.issueAndPostFromPackage
  → Package DISPATCHED · Trip IN_TRANSIT
  → GPS / Live Tracking (flespi MQTT → GpsLog · Socket.IO)
  → POD / deliver → Shipment DELIVERED
```

Capacity today: **quantity MVP** (not full weight/volume VRP). Route sequence: manual stop order.

## 8.3 Backend domains (`backend/src/scm/`)

| Area | Responsibility |
| --- | --- |
| vehicles / drivers | Fleet & driver masters, compliance docs |
| shipments | Lifecycle, create from MM package, assign-load |
| trips | Draft → planned → assigned → in transit → complete |
| tracking | MQTT/flespi, gateway, live positions |
| tile38 / geofences | Geofence hooks (optional Tile38) |
| maintenance | Service schedules, vehicle documents |
| forecasts / planning-settings | Demand planning stub + horizon config |
| dashboard | Ops KPIs |
| geocode / places | Address / place helpers |

**Module dependency (current):** `ScmModule` ↔ `MmModule` via `forwardRef` — trips call `GoodsIssueService` directly.

**Target (reduce coupling):** event/outbox handoffs instead of circular service injection:

```text
MM  → PackageReadyForDispatch → Outbox → SCM
SCM → DispatchRequested / ShipmentDispatched → Outbox → MM / SD
MM  → GoodsIssuePosted → Outbox → FICO / SD / SCM
```

Until then, keep **SCM command → MM integration port → MM domain operation** (no alternate stock engine).

## 8.4 Frontend (`src/modules/scm/`)

Demand Planning · Planning Horizons · Vehicles · Drivers · Shipments · Trips · Tracking · Maintenance · Dashboards · Vehicle Detail  

## 8.5 Driver app (`apps/driver/`)

Expo mobile: login, active trip, stop POD / signature — same API family.

## 8.6 Telematics / edge

- Flespi MQTT → Nest tracking  
- Optional Traccar / nginx stream (docs)  
- Edge Socket.IO proxy for production host (`scripts/erp-edge-proxy.cjs`, `ecosystem.config.cjs`, `next.config.mjs` rewrites)

## 8.7 SCM must not

- Directly decrease MM inventory  
- Post revenue / AR  
- Own material master or ATP  

---

# 9. Production Planning (PP) — supporting module

Not always listed in the five named pillars, but **present and required for MRP**:

| Piece | Role |
| --- | --- |
| `BomService` / `ProductionBomProvider` | BOM explosion for MM MRP |
| `ProductionOrderService` | Production orders; release / issue / output orchestration with MM |
| Event emitter / MM consumer | PP ↔ MM integration |

PP creates **production demand / component requirements**; physical issues still go through MM posting.

---

# 10. Cross-module integration matrix

| From → To | Mechanism (current / planned) |
| --- | --- |
| CRM → SD | Closed Won → Sales Order (**planned**) |
| SD → MM | Confirm SO → reservation / demand events (**integration**) |
| MM → SD | ATP / reservation / GI status (**events; UI thin**) |
| MM → SCM | `READY_FOR_DISPATCH` → Shipment (**implemented**) |
| SCM → MM | Trip start → `GoodsIssueService` (**implemented**) |
| SCM → SD / CRM | Dispatch / ETA / POD (**partial / planned consumers**) |
| MM → FICO | `MmAccountingEvent` consumer (**integration**) |
| SD → FICO | Invoice / AR (**planned**) |
| MM ↔ PP | BOM + production order orchestration (**integration**) |
| All → Exception Center | Read-only MM exception aggregation (**implemented in MM**) |

**Preferred pattern:**

```text
Domain TX → Outbox / typed event → Consumer → Consumer-owned TX
```

---

# 11. Data architecture (current)

```text
MASTER DATA          Org (Company/Plant/Branch/Warehouse), Materials, Suppliers,
                     Vehicles, Drivers, (future CRM accounts)

TRANSACTIONAL        PR/PO/SO, GR/GI, Counts, Shipments, Trips, Invoices*

OPERATIONAL STATE    MmInventoryBalance, reservations, WH tasks, trip status

IMMUTABLE HISTORY    MmInventoryTransaction, audits, GpsLog, domain outbox

ANALYTICS            MM reports/dashboard, SCM dashboard
```

Approx. Prisma: **~200 models**, majority `Mm*` / `Wm*`, plus SCM fleet/trip models and SD sales order models.

---

# 12. Transaction pipeline (all important writes)

```text
AuthN → AuthZ → Org scope → DTO validation → Business rules
  → Workflow/approval (where configured) → Concurrency / idempotency
  → DB transaction → Domain state → Audit → Outbox → Consumers
```

---

# 13. Entire current operational “happy path” (what you can run today)

### A. Inbound stock (MM)

```text
Seed/org + materials + suppliers
  → PR → PO → Expected receipt / ASN
  → Receive + GR (posting)
  → Optional QI
  → Putaway
  → Stock overview / ATP / ledger
```

### B. Outbound delivery (MM + SCM)

```text
Reserve / allocate (MM)
  → Pick → Pack → Ready for Dispatch
  → SCM Shipment READY
  → Load plan → Trip → Dispatch
  → Start (MM GI) → In transit + live map
  → POD → Delivered
```

### C. Planning (MM + PP)

```text
Demand + BOM (PP) → MRP run → requirements / suggestions
  → (human) convert to PR — MRP does not post stock
```

### D. Finance bridge (MM → FICO)

```text
Cost-relevant postings → valuation → MmAccountingEvent → FICO consumer / periods
```

### E. Not runnable end-to-end yet

```text
CRM lead → Closed Won → full SD UI quote/billing → FICO AR UI
Full AP payment cockpit · Full CRM customer 360 from SCM events
```

---

# 14. Forbidden overlaps (quick reference)

| Actor | Forbidden |
| --- | --- |
| CRM | Write inventory |
| SD | Direct inventory write; second ATP |
| MM | Write FICO GL; own routing/fleet |
| SCM | Direct stock decrease; post revenue |
| FICO | Operational inventory engine |
| MRP / Scanner / WH UI | Bypass `InventoryPostingService` |

---

# 15. Document map

| Doc | Purpose |
| --- | --- |
| [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md) | Canonical enterprise contract (all flows §§1–37) |
| [`ERP_EVOLUTION_ROADMAP.md`](./ERP_EVOLUTION_ROADMAP.md) | Maturity balance, O2C target, phases, integration hardening |
| [`MASTER_E2E_SALES_ORDER_SCENARIO.md`](./MASTER_E2E_SALES_ORDER_SCENARIO.md) | Primary O2C scenario + acceptance test (§32) |
| **This file** | Current maturity + module detail + runnable paths |
| [`MM_ARCHITECTURE.md`](./MM_ARCHITECTURE.md) | MM posting & MM-01…15 |
| [`SCM_PROCESS_FLOW.md`](./SCM_PROCESS_FLOW.md) | MM↔SCM logistics |
| [`CANONICAL_PATTERNS.md`](./CANONICAL_PATTERNS.md) | Code pointers |
| `AGENTS.md` | How agents change the system |

---

## Summary

AGCTEK is a **monorepo ERP** with **deep MM + SCM**, **integration-layer SD / PP / FICO**, and **scaffold CRM**. Architecture is **directionally correct** (ownership + inventory spine); the next leap is **end-to-end commercial flow** and **event/outbox decoupling** (especially SCM↔MM), not further MM module expansion — see [`ERP_EVOLUTION_ROADMAP.md`](./ERP_EVOLUTION_ROADMAP.md).
