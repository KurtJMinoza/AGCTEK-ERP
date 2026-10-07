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
| **CRM** | **Integration** (core) | `backend/src/crm/`, `src/modules/crm/` · extends `SdCustomer`; SO / RMA / loyalty accrual deferred |

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
┌─────────────┐     Closed Won (draft SO)  
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
Lead → Qualify → Opportunity → SD Quotation (Proposal / Negotiation) → CLOSED WON
  → SD Sales Order (converts the sent / accepted quotation, or direct lines)
Opportunity → CLOSED LOST → active SD Quotation cancelled

Support / RMA request → SD return auth → MM return receiving → QI → disposition
```

## 7.3 Current implementation

| Layer | Status |
| --- | --- |
| Navigation | Hub `/modules/crm` → Dashboard, Customers, Leads, Opportunities, Tickets at `/crm/*` (permission-aware) |
| Backend | `backend/src/crm` — leads, opportunities, tickets + comments, loyalty (read), Customer 360; `/api/v1/crm/*`, every handler `RequirePermission(MODULE_CODES.CRM, …)` |
| Data | `crm_*` tables (migration `20261011120000_add_crm_core`); every CRM record references `SdCustomer` (`onDelete: Restrict`) — no CRM customer master, number or credit fields |
| Frontend | `src/modules/crm` (SCM layout: types · services · hooks · components · pages); `/crm` layout calls `requireModuleView('crm')` |

**Customer identity:** `SdCustomer` (SD) is the only customer master. CRM extends it via `CrmProfile` (1:0..1) and FKs from leads, opportunities, tickets and loyalty accounts. CRM writes only `crm_*` tables and reads `SdCustomer` / `User`.

**Activities:** `CrmActivity` (migration `20261012120000_add_crm_activities`) — scheduled next actions on opportunities and tickets (one `CrmActivitiesService`, endpoints `/crm/opportunities/:id/activities` and `/crm/tickets/:id/activities`). Opportunities accept new activities only in open stages; tickets accept them until CLOSED / CANCELLED (RESOLVED still takes follow-ups). Opportunity and ticket payloads carry `nextActivityStatus` (OVERDUE > DUE_TODAY > UPCOMING > NONE, business day Asia/Manila) from one grouped query. Lead conversion relinks the lead's activities (open and done) to the new opportunity, keeping `leadId`.

**Lead conversion:** `POST /crm/leads/:id/convert` (crm:create) is the only way to reach `CONVERTED` (PATCH refuses it). One transaction: link an existing `SdCustomer` or create one through SD's `CustomerService` (caller also needs sd:create; credit limit starts at 0 for SD to set), mark the lead CONVERTED, create the opportunity via `CrmOpportunitiesService` (stage gates apply), relink activities. LOST / UNQUALIFIED leads must be re-engaged first; any failure (gate, SD email conflict, concurrent edit) rolls everything back.

**Pipeline rules:** stage metadata (default probability, won/lost flags, gates) lives in `backend/src/crm/opportunities/opportunity-stages.ts` and is served by `GET /crm/opportunities/stages`. Forward moves are gated (Proposal/Negotiation: amount + expected close; Closed Won: amount + ACTIVE `SdCustomer`); backward moves are ungated and never clear amount, dates, customer or activities. Closed Lost requires `lostReason` (OTHER also `lostNotes`); leaving Lost clears only those. Closed Won may be reopened; `sdSalesOrderId` is never client-writable. `GET /crm/opportunities/pipeline` returns open amount and weighted amount (amount × probability) per stage and currency.

**Closed Won → SD handoff:** closing as won is `POST /crm/opportunities/:id/win` (crm:update + sd:create) with either a quotation (`quotationId`, or an empty body for the active SENT / ACCEPTED quotation; see **SD quotations** below) or `lines: [{productId, quantity}]` (SD product ids only), and optional `notes`; `PATCH` refuses `stage = CLOSED_WON`. The stage gates (amount, ACTIVE SdCustomer) run first, then one database transaction creates (or finds) the SD order and commits CLOSED_WON + `sdSalesOrderId` guarded by `stage`/`updatedAt`/`sdSalesOrderId IS NULL`; any failure (invalid product, currency, conflict) rolls back and the opportunity keeps its previous stage. A unique-key collision or stale row re-reads the opportunity: if it is already won with an order (concurrent or earlier request), that order is returned with `created: false`; otherwise the transaction is retried (max 3). Re-winning a reopened opportunity keeps its existing order and needs no lines. `POST /crm/opportunities/:id/sales-order` is the **Retry ERP handoff** for CLOSED_WON opportunities without an order (e.g. won before the handoff existed): same idempotent service, links without changing the stage. CRM calls SD's `SalesOrderService.createFromCrmOpportunity`, which prices lines from the SD catalog (`SD_CATALOG_CURRENCY` = PHP; a customer billed in another currency is rejected, never converted), requires one division and an ACTIVE customer, and creates a DRAFT with `channel = ECOMMERCE`, `source = CRM`, `crmOpportunityId` (unique; the idempotency key), `salesOwnerId` (opportunity owner) and `notes` (CRM estimated amount, informational only, + user notes). It runs in one transaction (optionally the caller's); a concurrent duplicate hits the unique constraint and the retry returns the recorded order. Every SD order carries `source` (POS | WEBSITE | CRM | ERP). Materials, company and warehouse resolve at SD confirm through the normal SD→MM pipeline. CRM writes `sdSalesOrderId` once (`WHERE sdSalesOrderId IS NULL`); a repeat call, or a retry after a partial failure, returns or links the same order. Once linked, the opportunity's customer is locked, reopening keeps the link, and CRM never edits or cancels the order. `GET /crm/opportunities/:id/sales-order` returns a read-only summary.

**SD quotations (from CRM opportunities):** `SdQuotation` / `SdQuotationLine` (migration `20261016120000_add_sd_quotations`) are SD documents; CRM only orchestrates. Ownership and flow:

```text
CRM Opportunity (PROPOSAL / NEGOTIATION, no SD order yet)
 ├── POST /crm/opportunities/:id/quotations ──► SD QuotationService.create (DRAFT, rev 1, Q-000012)
 │        SD: PATCH / send / accept / reject / cancel / revise  (/sd/quotations/:id[/action])
 ├── Closed Won  (POST :id/win, or Retry ERP handoff POST :id/sales-order)
 │        SENT / ACCEPTED quotation ──► SD Sales Order (DRAFT, frozen quotation lines + prices, quotationId set)
 │        no active quotation      ──► SD Sales Order from direct lines (catalog prices, quotationId NULL)
 └── Closed Lost ──► active quotation CANCELLED ("Opportunity closed as lost (<reason>)")
```

- **Statuses:** DRAFT → SENT → ACCEPTED / REJECTED / EXPIRED / CANCELLED / CONVERTED. Revising a SENT or ACCEPTED quotation marks it SUPERSEDED. Revising a REJECTED or EXPIRED one keeps its status. A revision keeps the number and increments `revision`. Allowed transitions live in `backend/src/sd/quotation.rules.ts`.
- **One active quotation per opportunity:** DRAFT, SENT and ACCEPTED count as active. The service refuses a second one with 409 `QUOTATION_ACTIVE_EXISTS`, and the partial unique index `sd_quotations_one_active_per_opportunity` enforces the same rule in the database under concurrency.
- **Pricing:**
  - A DRAFT is re-priced from the SD catalog (PHP) on every edit.
  - **Send** freezes the prices. If catalog prices changed since the last save, send stores the new prices on the draft and returns 409 `QUOTATION_PRICES_CHANGED` with `changedLines`, so the user reviews and sends again. Nothing is sent automatically.
  - Inactive or deleted products block send with `QUOTATION_UNAVAILABLE_PRODUCTS`.
  - Validity ends at 23:59:59.999 Asia/Manila on the chosen day (default 30 days). An overdue SENT or ACCEPTED quotation reads as EXPIRED and is persisted as EXPIRED before any write.
- **Win rules (CRM `CrmOpportunityHandoffService`, under the opportunity row lock):**
  - An empty body converts the active SENT or ACCEPTED quotation.
  - A DRAFT blocks the win with `QUOTATION_DRAFT_PENDING`.
  - Lines sent while a SENT or ACCEPTED quotation exists are refused with `QUOTATION_ACTIVE`.
  - An explicitly chosen expired quotation is refused with `QUOTATION_EXPIRED`.
  - When no active quotation exists (including one that has expired), direct lines are used.
  - Sending a quotation and lines together returns 400.
  - Conversion claims the quotation under its row lock and re-checks opportunity, customer and expiry. It does not re-read the catalog: a product deactivated after sending still converts.
  - Concurrent wins and retries all succeed with one order. A failed order creation rolls the claim back and the quotation stays SENT / ACCEPTED.
- **Opportunity guards:**
  - A customer change is refused with `QUOTATION_ACTIVE` while a quotation is active.
  - Closed Lost cancels the active quotation in the same transaction.
  - Revise is refused with `QUOTATION_OPPORTUNITY_ORDERED` once the opportunity has an SD order.
  - New quotations are refused once an order is linked, even after reopening.
- **Permissions:**
  - Creating from CRM needs crm:update and sd:create.
  - SD endpoints use sd:read and sd:update.
  - Closed Lost cancellation only needs crm:update.
- **Out of scope:** PDF / e-mail delivery, a customer portal, and an SD quotations list page.
- **Migration warning:** the partial index and the sequence `sd_quotation_number_seq` are raw SQL that Prisma cannot model. `prisma migrate dev` / `migrate diff` may propose dropping `sd_quotations_one_active_per_opportunity`; delete that statement from any generated migration.
- **Real-database verification:** `npm run test:pg` (backend, uses `DATABASE_URL`) runs `src/sd/quotation.pg-spec.ts`. It covers the partial index, the sequence, rollback, concurrent creation and wins, and the lock races. It creates and deletes its own data, and the default `npm test` does not run it.

**Customer 360:** `GET /crm/customers/:id/360` returns 404 only when the `SdCustomer` is missing. Profile, opportunities, tickets, loyalty, SD orders and SCM shipments are read live and independently; each reports `sections.<name>.status` (`ok` | `unavailable` | `not_connected`). A failing section falls back to null/[] (summary counts null) and the rest of the payload still returns 200. SD orders come from `SalesOrderService.list({ customerId, limit: 20 })`, each tagged with the CRM opportunity that handed it off. Shipments come from SCM's `ShipmentsService.findBySalesOrderIds`, which resolves by id through package → picking task → MM reservation header (source SD / SALES_ORDER), or the legacy `SALES_ORDER:<id>` picking source. Shipments depend on the orders read, so they become unavailable when SD fails. Nothing is copied into CRM.

**Ticket queue:** `GET /crm/tickets` defaults to the working queue (OPEN + WAITING_CUSTOMER) sorted by priority (URGENT → LOW, oldest first within a priority); `queue=ALL` drops the status filter, an explicit `status` overrides the queue, and `sort=newest` orders by creation date. Priority paging uses per-priority counts (one `groupBy`) rather than a stored rank column. `rmaReference` is free text, searchable, and informational until the SD return flow exists.

**Opportunity workspace:** `/crm/opportunities/[id]` is the canonical place to work a deal (table name / Open, board card click, Customer 360 and "New opportunity" all land there). It reuses the existing APIs only: `GET /crm/opportunities/:id` (also returns `owner` display fields and the source lead's `source`), `PATCH` for stage moves and details (server gates, transitions and lost reason apply; the stage bar adds the no-activity and reopen advisories), `POST :id/win`, the opportunity activity endpoints, and the read-only `GET :id/sales-order`. A **Quotations** panel (`#quotations`) lists the opportunity's SD quotations newest first.
- Each shows number and revision, status, total, validity and dates, with the lines on demand.
- Actions follow the quotation status: Edit / Send / Cancel for a DRAFT, Accept / Reject / Revise / Cancel for SENT, Revise / Cancel for ACCEPTED, and Revise for REJECTED or EXPIRED while the deal is open and has no order.
- The send dialog shows the catalog price changes and highlights the affected lines.

Choosing Closed Won opens the win dialog with a readiness checklist (active SD customer, customer currency equals the SD catalog currency PHP, estimated amount, and an order source). The checklist must pass before the confirm button is enabled; the server re-checks everything. The order source depends on the quotation:
- A SENT or ACCEPTED quotation is shown as "Convert Q-… rev n" with its lines.
- A DRAFT blocks the win and offers "Open quotation".
- An expired quotation shows a warning plus the product-line picker.
- With no quotation, the dialog shows the shared product-line picker (`ProductLinesEditor`, also used by the quotation editor). The edit form never offers Closed Won. After success the page shows the SD order number with E-commerce / CRM origin badges and a link to the SD sales-orders list (SD has no order detail route). Won deals without a linked order show "Retry ERP handoff" (workspace header and opportunities table), which calls `POST :id/sales-order`. The timeline is derived from stored data (activities, creation, current close, SD order link); there is no stage-change audit.

**CRM dashboard:** `GET /crm/dashboard?days=30|90|365` (crm:read, default 90) is a read-only summary from CRM tables only. Live counts are new / qualified leads, records with overdue activities (opportunities and tickets, each with an activity count), the weighted open pipeline (same query as `/crm/opportunities/pipeline`), and the default ticket queue by priority and status. The period covers win/loss by `closedAt` (won amount per currency, lost by reason, win rate) and the lead cohort created in the window with its current status (no `convertedAt` is stored). Every widget links to a list filtered to exactly those records: `opportunities?activity=OVERDUE|stage|lostReason|closedFrom|view=board`, `tickets?queue=ALL&activity=OVERDUE|priority|status`, `leads?status|createdFrom`. The "overdue" rule (record still accepts activities and has an open activity past due) lives once in `CrmActivitiesService` and is shared by the list filters and the dashboard. List pages read these query parameters on load and show filters without a control as removable chips.

**Deferred (`TODO(crm-integration)`):** ticket RMA → SD return authorization; loyalty accrual from FICO invoice clearance; FICO invoices / AR in Customer 360 (`sections.invoices = not_connected`).

Do not invent inventory or SO engines inside CRM.

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
| CRM → SD | Opportunity quotations via `QuotationService` (SD owns them; CRM creates them through `CrmOpportunityQuotationsService`). Closed Won → ECOMMERCE / CRM draft Sales Order via `SalesOrderService.createFromCrmOpportunity`, which converts the SENT / ACCEPTED quotation at its frozen prices or prices direct lines from the catalog (idempotent on `crmOpportunityId`). Closed Lost cancels the active quotation through `QuotationService.cancelActiveForOpportunity` |
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
