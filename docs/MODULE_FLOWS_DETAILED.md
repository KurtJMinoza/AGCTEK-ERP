# AGCTEK ERP — Module Architecture & Detailed Flows

**Parent contracts:**  
[`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md) · [`CURRENT_ENTERPRISE_ARCHITECTURE.md`](./CURRENT_ENTERPRISE_ARCHITECTURE.md)

This document is **flow-first**: for each module (CRM, SD, MM, FICO, SCM) it states ownership, detailed step flows, handoffs, and what runs in the repo today.

---

## Legend

| Marker | Meaning |
| --- | --- |
| ✅ | Implemented (API and/or UI in repo) |
| 🔶 | Partial / integration backend only |
| ⬜ | Defined in architecture; not built yet |

---

# 1. Big picture — enterprise flow

```text
                         ┌──────────┐
                         │ CUSTOMER │
                         │ / MARKET │
                         └────┬─────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ CRM  Lead → Qualify → Opportunity → Closed Won                          │
│      Support / RMA initiation · Customer 360 (ETA/POD from SCM)         │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ Closed Won ⬜
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SD   Quote → SO → Price → Credit(FICO) → ATP(MM) → Confirm → Fulfill    │
│      → Billing → AR(FICO)                                               │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ demand / confirm 🔶           │ invoice ⬜
                ▼                               ▼
┌───────────────────────────────────┐   ┌─────────────────┐
│ MM  ATP · Reserve · Allocate      │   │ FICO  AR / GL   │
│     Pick · Pack · READY           │   │      periods 🔶 │
│     P2P · QI · Count · Valuation  │   └────────▲────────┘
└───────────────────┬───────────────┘            │
                    │ READY_FOR_DISPATCH ✅       │ accounting events ✅/🔶
                    ▼                             │
┌───────────────────────────────────┐            │
│ SCM  Shipment → Load → Trip       │            │
│      Dispatch → GI(MM) → Transit  │────────────┘
│      GPS → POD → Delivered ✅     │── status → SD/CRM ⬜
└───────────────────────────────────┘
```

**Parallel MM supply cycle (always available):**

```text
Shortage → MRP → PR → RFQ → PO → Receive → GR → QI? → Putaway → Stock ✅
```

---

# 2. CRM — Customer Relationship Management

## 2.1 Owns

Leads, accounts, contacts, opportunities, campaigns, activities, support context, **RMA initiation**. Customer-facing consolidated view of delivery status (from SCM).

## 2.2 Must not

Write inventory · Own sales-order posting · Own fleet/POD execution.

## 2.3 Detailed flow — lead to order

```text
① Capture lead                         ⬜
      │
② Qualify / score                      ⬜
      │
③ Convert to opportunity               ⬜
      │
④ Activities (call / meeting / task)   ⬜
      │
⑤ Proposal / quote (commercial may live in SD)  ⬜
      │
⑥ Negotiation                          ⬜
      │
⑦ CLOSED WON                           ⬜
      │
      └──► handoff payload ──► SD Create Sales Order  ⬜
```

## 2.4 Detailed flow — support / return

```text
Customer complaint / return request (CRM)     ⬜
      │
      ▼
RMA / case opened                             ⬜
      │
      ▼
SD Return Authorization                       ⬜
      │
      ▼
MM Return Receiving → QI → Disposition ✅ (MM side exists)
      │
      ▼
FICO credit / adjustment event                🔶/⬜
```

## 2.5 Detailed flow — customer 360 (read)

```text
SCM: ShipmentStatus · ETA · Exception · POD   ✅ (SCM produces)
      │
      ▼
CRM Customer 360 / notifications              ⬜ (consume)
```

## 2.6 Repo today

| Piece | Status |
| --- | --- |
| Nav `/modules/crm/*` | ✅ scaffold |
| Backend `crm` module | ⬜ |
| Frontend `src/modules/crm` | ⬜ |

---

# 3. SD — Sales & Distribution

## 3.1 Owns

Quote, pricing, **sales order**, credit process (calls FICO), fulfillment status, **billing / O2C**.

## 3.2 Must not

Direct inventory write · Second ATP engine · Fleet routing.

## 3.3 Detailed flow — order to cash (target)

```text
① Create Sales Order (DRAFT)                 🔶 API
      │
② Pricing / conditions                       ⬜
      │
③ Credit check ──────────────────► FICO      ⬜
      │
④ ATP check ─────────────────────► MM        🔶 (via integration)
      │         │
      │    SHORTAGE → MM MRP / wait            ✅ MRP exists
      │         │
      │    OK ──┘
      ▼
⑤ Confirm order                              🔶 API
      │
⑥ Reservation / demand in MM                 🔶 orchestration
      │
⑦ Fulfillment (MM pick/pack)                 ✅ MM
      │
⑧ Delivery (SCM)                             ✅ SCM
      │
⑨ Billing / invoice                          ⬜
      │
⑩ AR / Revenue ──────────────────► FICO      ⬜
```

## 3.4 Detailed flow — confirm → MM (current API)

```text
POST /api/v1/sd/sales-orders                 ✅ create DRAFT + lines
      │
POST .../confirm                             ✅ status CONFIRMED + events
      │
SdMmOrchestration / SdIntegration            🔶
      │
MM reservation header on lines               🔶
      │
(optional) issueSalesOrder → GoodsIssue      🔶
      │        create GI + post via InventoryPostingService
```

**Also:** cancel SO, change line qty (API).

## 3.5 Repo today

| Piece | Status |
| --- | --- |
| `backend/src/sd/*` | ✅ integration |
| Nav `/modules/sd/*` | ✅ scaffold |
| `src/modules/sd` UI | ⬜ |

---

# 4. MM — Materials Management

## 4.1 Owns

Material/supplier masters · procurement · receiving/quality · **inventory truth** · WH execution · MRP (plan only) · valuation · returns · barcode · analytics.

## 4.2 Core posting flow (every physical change)

```text
User / scanner / domain service
      │
      ▼
Auth · Scope · DTO · Business rules · Idempotency
      │
      ▼
InventoryPostingService                      ✅ sole writer
      │
      ├── MmInventoryTransaction (immutable)
      ├── MmInventoryBalance (derived)
      ├── ValuationEngine (if cost-relevant)
      ├── Audit + domain events
      └── MmAccountingEvent ──────────► FICO 🔶
```

**ATP flow:**

```text
SD / PP / UI request
      │
      ▼
InventoryAvailabilityService                 ✅
      │
      ├── Unrestricted on-hand
      ├── − Reserved
      └── exclude restricted (QI, BLOCKED, …)
      │
      ▼
ATP result (API — UI must not recompute)
```

---

## 4.3 Flow A — Procure to stock (P2P) ✅

```text
① Demand / MRP shortage / manual need
      │
② Purchase Requisition
      │
③ PR approval (workflow)
      │
④ RFQ + invite suppliers
      │
⑤ Supplier quotations
      │
⑥ Quotation comparison + award
      │
⑦ Purchase Order
      │
⑧ PO approval
      │
⑨ ASN / Expected Receipt
      │
⑩ Receiving workbench (match / variance)
      │
⑪ Goods Receipt ──► InventoryPostingService
      │
⑫ Inspection required?
      │         ├── NO  → Putaway task → confirm → bin stock
      │         └── YES → Inspection lot → sample → results
      │                    ├── PASS → usage decision ACCEPT → Putaway
      │                    ├── REWORK / HOLD
      │                    └── FAIL → NC / supplier return
      ▼
⑬ Stock visible in overview / ATP / ledger
```

**Three-way match (AP control):**

```text
PO + GR + Supplier Invoice → Match → MATCH | EXCEPTION → FICO AP 🔶/⬜
```

---

## 4.4 Flow B — Outbound warehouse to SCM ✅

```text
① Sales / production requirement
      │
② ATP check
      │
③ Reservation (commits qty — does NOT reduce on-hand)
      │
④ Allocation (FIFO / FEFO — picks specific stock)
      │
⑤ Pick task → scan bin / material / batch / serial → confirm picked
      │        (still no on-hand decrease)
⑥ Packing session → package → verify / seal
      │
⑦ markReadyForDispatch
      │        status = READY_FOR_DISPATCH
      │        ShipmentsService.createFromPackage (idempotent) ✅
      ▼
⑧ SCM owns logistics (see §6)
      │
⑨ On trip start: GoodsIssueService.issueAndPostFromPackage ✅
      │        → InventoryPostingService
      │        → package DISPATCHED
      ▼
⑩ Valuation / COGS accounting event → FICO 🔶
```

---

## 4.5 Flow C — Inventory control (count) ✅

```text
Count policy → Count plan → Count session
      │
Blind / cycle / physical count entry
      │
Variance analysis
      │
Recount (if needed)
      │
Adjustment request → Approval
      │
InventoryPostingService → COUNT_GAIN / COUNT_LOSS
      │
Valuation → FICO event
```

---

## 4.6 Flow D — MRP (planning only) ✅

```text
Demand sources: SD 🔶 · PP BOM ✅ · Manual planning demand ✅
      │
Demand aggregation
      │
MRP scope loader
      │
MRP engine
      │
Read: inventory · open PO · reservations (no writes to stock)
      │
Projected stock → Net requirement
      │
├── No shortage → stop
└── Shortage → Planned order / Procurement suggestion
                    │
                    └── Human converts to PR (MM procurement) ✅
```

**Rule: MRP NEVER POSTS INVENTORY.**

---

## 4.7 Flow E — Customer / supplier returns ✅/🔶

```text
Supplier path:
  QI REJECT → Hold → Supplier return → RETURN_OUT → posting → FICO/AP 🔶

Customer path (full CRM/SD auth ⬜):
  Return receive (MM) → QI → RESTOCK / SCRAP / BLOCK → posting ✅
```

---

## 4.8 Repo map

`backend/src/mm/` + `src/modules/mm/` — Deep (MM-01…15).  
Gate: `.cursor/rules/mm-architecture.mdc` · Skill: `materials-management`.

---

# 5. FICO — Finance & Controlling

## 5.1 Owns

GL, AP, AR, credit, financial periods, cost controlling, financial reporting.

## 5.2 Must not

Own operational on-hand · Bypass MM posting.

## 5.3 Detailed flow — MM operational to GL

```text
MM GR / GI / Adjust / Scrap / Return / Landed cost
      │
ValuationEngine
      │
MmAccountingEvent (outbox)
      │
FicoAccountingConsumerService                🔶
      │
Journal / GL lines                           🔶
      │
Reconciliation checks                        🔶 API
```

**Period control:**

```text
MM posting asks FINANCIAL_PERIOD_PORT
      │
FicoFinancialPeriodService — open / closed   🔶
```

## 5.4 Detailed flow — SD billing to AR (target)

```text
Delivery complete / billing trigger
      │
SD Invoice                                   ⬜
      │
FICO AR + Revenue                            ⬜
```

## 5.5 Detailed flow — AP

```text
MM three-way MATCH
      │
FICO vendor invoice / payment                ⬜ (match UI in MM 🔶)
```

## 5.6 Repo today

| API | Status |
| --- | --- |
| `GET/POST /fico/periods`, `PATCH status` | ✅ |
| `GET /fico/reconciliation` | ✅ |
| Accounting consumer / journals | 🔶 |
| Full CoA / AP / AR UI | ⬜ nav only |

---

# 6. SCM — Supply Chain Management

## 6.1 Owns

Shipment, load building, route sequence, vehicle, driver, dispatch, trip, GPS, tracking, POD, maintenance. **No HCM.**

## 6.2 Must not

Decrease MM stock directly · Post revenue · Own material master.

## 6.3 Detailed flow — warehouse release to delivery ✅

```text
① MM package READY_FOR_DISPATCH
      │
② Auto/idempotent: create SCM Shipment (READY, packageId link)
      │     retry: POST /mm/packages/:id/retry-scm-release
③ Order pooling — multi-select READY shipments
      │
④ Load plan drawer
      │     capacity = quantity MVP (not full VRP weight/volume)
⑤ Stop sequence (manual up/down)
      │
⑥ Save draft → Trip DRAFT  |  Approve → Trip PLANNED
      │     shipments → ASSIGNED when dispatched
⑦ Dispatch — assign vehicle + driver
      │
⑧ Start trip
      │     GoodsIssueService.issueAndPostFromPackage  ✅ (MM)
      │     package → DISPATCHED
      │     trip → IN_TRANSIT
⑨ Live tracking
      │     flespi MQTT → GpsLog → Socket.IO map ✅
      │     geofence / Tile38 hooks (optional) 🔶
⑩ Arrival → POD (web / driver app)
      │
⑪ Shipment DELIVERED (no GR for customer outbound)
      │
⑫ Notify SD fulfillment / CRM 360                 ⬜
```

## 6.4 Trip state machine (simplified)

```text
DRAFT → PLANNED → ASSIGNED → IN_TRANSIT → COMPLETED
                      │            │
                   Dispatch     Start (+ MM GI)
```

## 6.5 Demand planning (SCM pillar 1) 🔶

```text
Planning horizons settings ✅
Forecast stub API / UI hooks 🔶
(Does not yet drive load building or MM MRP sync)
```

## 6.6 Repo today

| Area | Status |
| --- | --- |
| Backend `scm/*` | ✅ |
| Frontend `src/modules/scm` | ✅ |
| Driver Expo app | ✅ |
| Edge proxy / ecosystem | ✅ (prod hosting) |

---

# 7. Cross-module sequence — full O2C (as designed)

```text
CRM Closed Won ⬜
  → SD Sales Order 🔶
  → Credit FICO ⬜
  → ATP MM ✅
  → Confirm + Reserve MM 🔶
  → Pick / Pack MM ✅
  → READY → SCM Shipment ✅
  → Trip / Dispatch / Start (+ GI) ✅
  → GPS / POD ✅
  → SD Bill ⬜ → FICO AR ⬜
  → CRM update ⬜
```

# 8. Cross-module sequence — full P2P (as designed)

```text
MRP shortage ✅
  → PR → RFQ → PO ✅
  → ASN → Receive → GR ✅
  → QI ✅
  → Putaway ✅
  → Valuation event → FICO 🔶
  → 3WM → AP payment 🔶/⬜
```

---

# 9. Event examples (integration backbone)

```text
SD → MM     SalesOrderConfirmed / Cancelled / DemandChanged
MM → SD     ATPUpdated / ReservationCreated / GoodsIssuePosted
MM → SCM    PackageReadyForDispatch / ShipmentReady
SCM → MM    (service call) GoodsIssue on trip start
SCM → SD    ShipmentDispatched / ETAUpdated / PODCaptured / Delivered
SCM → CRM   ShipmentStatusChanged / ETA / Delivered
MM → FICO   GR/GI/Adjust/Scrap/Return/Valuation/LandedCost events
SD → FICO   InvoiceCreated / CreditMemoCreated
CRM → SD    OpportunityWon / CustomerUpdated
```

Pattern: **Domain TX → Outbox → Consumer → Consumer-owned TX**.

---

# 10. One-page ownership cheat sheet

| Module | Verb | Output artifacts |
| --- | --- | --- |
| CRM | Relate | Lead, Opportunity, RMA case |
| SD | Sell | Sales Order, Invoice |
| MM | Stock | Ledger, Balance, Package READY |
| SCM | Move | Shipment, Trip, POD |
| FICO | Account | Period, Journal, AR/AP |
| PP | Produce-plan | BOM, Production Order demand |

```text
ONE posting engine · ONE ATP · ONE MRP (non-posting)
ONE owner per concept · NO duplicate business logic
```
