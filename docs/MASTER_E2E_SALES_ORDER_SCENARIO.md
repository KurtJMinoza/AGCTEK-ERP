# Master Scenario — One Sales Order End-to-End

**Status:** Primary **business scenario** and **ERP acceptance test** contract  
**Parent:** [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md)  
**Roadmap:** [`ERP_EVOLUTION_ROADMAP.md`](./ERP_EVOLUTION_ROADMAP.md) · **Current wiring:** [`CURRENT_ENTERPRISE_ARCHITECTURE.md`](./CURRENT_ENTERPRISE_ARCHITECTURE.md)

When implementation and this document disagree on **ownership or invariants** (posting, ATP, credit, billing), fix code or escalate — do not bypass authoritative engines.

---

## Scenario spine

```text
CRM
  ↓
SD
  ↓
FICO Credit
  ↓
MM ATP
  ↓
MM Reservation
  ↓
MM Allocation
  ↓
MM Picking
  ↓
MM Packing
  ↓
SCM Shipment
  ↓
SCM Load Planning
  ↓
SCM Route / Driver / Vehicle
  ↓
SCM Dispatch
  ↓
MM Goods Issue
  ↓
SCM In Transit
  ↓
SCM GPS / ETA
  ↓
SCM POD
  ↓
SD Delivery Fulfillment
  ↓
SD Billing
  ↓
FICO AR / Revenue
  ↓
CRM Customer History
```

**Repo today:** MM → SCM (through POD) and MM → FICO (COGS path via `MmAccountingEvent`) are largely wired. CRM, full SD UI, credit, fulfillment/billing, FICO AR, and CRM 360 are **target** steps — see [§ Coverage](#coverage-repo-today).

---

## Coverage (repo today)

| Step | Owner | Typical status |
| --- | --- | --- |
| Reservation → Pack → `READY_FOR_DISPATCH` | MM | **Implemented** |
| Shipment, load, trip, dispatch, GI on trip start | SCM + MM | **Implemented** |
| In transit, GPS, POD, delivered | SCM | **Implemented** (telematics optional) |
| SD Sales Order confirm → MM orchestration | SD + MM | **Integration** |
| CRM Lead → Closed Won → SD | CRM + SD | **Planned** |
| FICO credit check on SO | FICO + SD | **Planned** |
| SD fulfillment + invoice | SD | **Planned** |
| FICO AR / revenue from invoice | FICO | **Planned** |
| CRM customer history aggregation | CRM | **Planned** |

---

## 1. CRM

CRM creates the commercial relationship:

```text
Lead
 ↓
Qualification
 ↓
Opportunity
 ↓
Proposal / Quote
 ↓
Negotiation
 ↓
Closed Won
```

Then:

```text
OpportunityWon
       ↓
       SD
```

CRM owns relationship and opportunity. It does **not** create inventory, reservations, picking, or invoices.

---

## 2. SD creates the Sales Order

```text
CRM Closed Won
      ↓
Sales Quote / Pricing
      ↓
Sales Order
      ↓
Order Validation
```

SD owns:

```text
Customer order · Pricing · Discounts · Taxes · Commercial terms · Order status
```

---

## 3. SD → FICO credit check

```text
Sales Order
     ↓
Credit Check
     ↓
FICO
```

Response:

```text
PASS  → Continue
BLOCK → Credit hold (SD owns order; FICO owns exposure)
```

---

## 4. SD → MM ATP

```text
Sales Order
    ↓
MM ATP
```

MM responds:

```text
On Hand − Reserved = Available
```

Frontend and SD must **consume MM ATP APIs** — no second ATP engine.

---

## 5. ATP branches

```text
                 ATP
                  │
          ┌───────┴────────┐
          ▼                ▼
     SUFFICIENT          SHORTAGE
          │                │
          ▼                ▼
     Reservation          MRP
                             │
                             ▼
                        Procurement
                             │
                             ▼
                         Inventory
                             │
                             └──────► ATP
```

A Sales Order can create demand that eventually drives procurement and replenishment.

---

## 6. MM reservation

```text
Sales Order → Reservation
```

Example:

```text
Order = 100 · Available = 150
Reservation = 100 · Remaining Available = 50
```

Physical stock unchanged until Goods Issue.

---

## 7. MM allocation

```text
Reservation: 100
       ↓
Allocation Engine (FIFO / FEFO / rules)
       ↓
WH-01 / Bin A01 = 50
WH-01 / Bin A02 = 30
WH-02 / Bin B04 = 20
```

Reservation = how much is committed. Allocation = which stock fulfills it.

---

## 8. MM picking

```text
Allocation → Pick Task → Source bin → Scan → Batch/serial → Qty → Picked
```

Picking does **not** reduce physical stock — Goods Issue does.

---

## 9. MM packing

```text
Picked → Packing session → Verify → Package → Weight · Dimensions · Label
  → READY_FOR_DISPATCH
```

Integration event:

```text
PackageReadyForDispatch
```

---

## 10. MM → SCM (ownership boundary)

```text
                 MM
                  │
             READY_FOR_DISPATCH
                  │
                  ▼
                 SCM
```

MM: goods are physically prepared. SCM: how they move. MM does not assign routes or vehicles.

---

## 11. SCM shipment creation

```text
Shipment → Lines → Packages → Destination → Delivery window
```

One sales order → many shipments:

```text
SO-1001
   ├── Shipment-001
   ├── Shipment-002
   └── Shipment-003
```

---

## 12. SCM load planning

```text
Ready Packages → Shipment pool → Consolidation
  → Weight · Volume · Vehicle capacity → Load plan
```

SCM owns consolidation and capacity (target: weight/volume VRP; MVP may be quantity-based).

---

## 13. SCM route planning

```text
Shipment → Stops → Windows → Vehicle restrictions → Route → Stop sequence → ETA
```

SCM owns route optimization — not MM.

---

## 14. SCM driver + vehicle assignment

```text
Shipment plan → Driver availability / qualification
  → Vehicle capacity / availability → Assignment
```

Drivers and vehicles live in SCM (no HCM module).

---

## 15. SCM dispatch

```text
Load plan → Manifest → Driver app → Dispatch confirmation → Trip started
```

Then:

```text
Trip Started → MM Goods Issue
```

(Current: trip start invokes MM GI via integration port; target: event/outbox — see roadmap.)

---

## 16. MM Goods Issue

```text
SCM Dispatch
      ↓
MM Goods Issue
      ↓
InventoryPostingService
      ↓
MmInventoryTransaction → MmInventoryBalance ↓
      ↓
Valuation → Accounting event
```

Stock physically leaves MM warehouse control.

---

## 17. FICO COGS

MM does not post GL directly:

```text
MM Goods Issue → Valuation → MmAccountingEvent → FICO → COGS / inventory accounting
```

---

## 18. SCM in transit

```text
Package → DISPATCHED → IN_TRANSIT
```

SCM owns trip, route, vehicle, driver, GPS, ETA, delivery status.

---

## 19. Live tracking

```text
Vehicle → GPS / telematics → SCM tracking → Location · ETA · Customer-facing status
```

---

## 20. CRM customer portal (read model)

```text
Order → Shipment → Dispatched → In transit → ETA → Delivered
```

CRM presents relationship view; SCM owns GPS and trip state.

---

## 21. POD

```text
Arrival → Stop validation → Qty confirmation → Signature / photo
  → POD → DELIVERED
```

---

## 22. SCM → SD

```text
PODCaptured → DeliveryCompleted → SD
```

SD updates shipment fulfillment, SO fulfillment, delivery status. SCM remains transportation owner.

---

## 23. SD billing

```text
Fulfillment / billing rule → SD Invoice → FICO
```

SD: invoice, billing rules, commercial account. FICO: AR, revenue, journal.

Billing trigger is **configurable** (GI, delivery, POD, contract milestone) — see master flow §3.

---

## 24. FICO AR / revenue

```text
SD Invoice → FICO → AR + Revenue
```

---

## 25. CRM customer history (360)

```text
Customer → CRM view of:
  Opportunity · SO · Shipment · Delivery · Invoice · Payment · Support · Returns
```

CRM is **not** system of record for those transactions.

---

## 26. Parallel: Procure-to-Pay (supplier)

```text
MRP → PR → Approval → RFQ → Quotation → PO → ASN → Receiving → GR → QI → Putaway → Inventory
```

FICO:

```text
PO + GR + Supplier invoice → Three-way match → AP → Payment
```

Runnable today on MM depth; not part of the O2C acceptance test but shares posting and FICO events.

---

## 27. Parallel: Production (PP → MM)

```text
Production Order → Component demand → MM reservation → Allocation → Pick → GI
  → Production → Output → MM GR → Inventory
```

PP owns production order/BOM; MM owns physical inventory.

---

## 28. Returns loop (future extension)

```text
DELIVERED → Complaint → CRM → RMA → SD return auth → MM return receiving → QI → Disposition
  → RESTOCK (RETURN_IN) or SCRAP → FICO
```

Same ownership rules; validate after master O2C passes.

---

## 29. Complete ERP loop (diagram)

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
                     Quote / Pricing
                               │
                          Sales Order
                               │
                               ▼
                        Credit Check
                               │
                               ▼
                         ATP via MM
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
           STOCK AVAILABLE                SHORTAGE
                │                             │
                │                             ▼
                │                            MRP → Procurement → PO → … → Putaway
                └─────────────────────────────┘
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
                               │
          Shipment → Load → Route → Vehicle + Driver → Dispatch
                               │
                       MM Goods Issue
                               │
                  ┌────────────┼─────────────┐
                  ▼            ▼             ▼
                 MM          FICO           SCM
              Inventory      COGS        IN_TRANSIT → GPS/ETA → POD → DELIVERED
                               │
                        ┌──────┼──────┐
                        ▼      ▼      ▼
                       SD     CRM    FICO
                  Fulfillment  360   AR/Revenue
                  / Billing
```

---

## 30. Technical architecture underneath

```text
                  USER / CLIENT
                       │
                       ▼
                 API / COMMAND
                       │
                       ▼
                AUTH + SCOPE
                       │
                       ▼
                DOMAIN SERVICE
                       │
                       ▼
              DATABASE TRANSACTION
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       Business State          OUTBOX
             │                   │
             ▼                   ▼
           Audit              Event → MM / SCM / SD / FICO / CRM consumers
```

No cross-module direct DB writes — only **API / domain port / event**.

---

## 31. Ownership and interaction rules

```text
CRM  → relationship          SD   → commercial transaction
MM   → material + inventory   SCM  → physical transportation
FICO → financial transaction  PP   → production
```

Allowed handoffs (via port or event only):

```text
CRM → SD · SD → MM · SD → FICO · MM → SCM · MM → FICO
SCM → SD · SCM → CRM · PP → MM · MM → PP
```

---

## 32. Ultimate acceptance test

### 32.1 Procedure (integration test script)

Execute in order:

```text
CREATE CRM OPPORTUNITY
        ↓
CLOSE WON
        ↓
CREATE SD SALES ORDER
        ↓
PRICE ORDER
        ↓
FICO CREDIT CHECK
        ↓
MM ATP
        ↓
RESERVE → ALLOCATE → PICK → PACK → READY_FOR_DISPATCH
        ↓
CREATE SCM SHIPMENT → BUILD LOAD → ROUTE → ASSIGN DRIVER + VEHICLE
        ↓
DISPATCH → MM GOODS ISSUE → FICO COGS
        ↓
SCM IN_TRANSIT → GPS / ETA → POD → DELIVERED
        ↓
SD FULFILLMENT → SD INVOICE → FICO AR + REVENUE
        ↓
CRM CUSTOMER HISTORY
```

Use a single **`correlationId`** (e.g. tied to SO number) on all emitted events for traceability.

### 32.2 Post-conditions (must all pass)

| # | Assertion |
| --- | --- |
| 1 | Sales order status = **FULFILLED** (or agreed partial state documented) |
| 2 | Inventory quantity **correctly reduced** vs pre-GI |
| 3 | **Immutable** `MmInventoryTransaction` exists for GI |
| 4 | Reservation **closed** / consumed |
| 5 | Allocation **consumed** |
| 6 | Package status = **DELIVERED** |
| 7 | Shipment status = **DELIVERED** |
| 8 | Trip status = **COMPLETED** |
| 9 | POD **captured** (signature/photo if required) |
| 10 | FICO **COGS** posted from GI accounting event |
| 11 | SD **invoice** created |
| 12 | FICO **AR** posted from invoice event |
| 13 | CRM customer history **reflects** SO, shipment, delivery, invoice |
| 14 | **Audit trail** complete for each mutating step |
| 15 | **Event chain** traceable by `correlationId` end-to-end |

### 32.3 Implementation note

Until CRM and full SD/FICO billing exist, run **phased acceptance**:

1. **Phase A (today):** SD SO (API) → MM reserve…pack → SCM → GI → POD + FICO COGS assertions.  
2. **Phase B:** Add credit + ATP gate on confirm.  
3. **Phase C:** SD fulfillment + invoice + FICO AR.  
4. **Phase D:** CRM Closed Won + customer 360 read model.

Phase A must not regress when B–D land; extend the same test file with gated steps.

**Target test location (when implemented):** `backend/test/e2e/master-sales-order.e2e-spec.ts` (or equivalent) — seeded org/materials/customer, idempotent where possible.

---

## 33. Extensions (same pattern)

After the master scenario passes, derive acceptance variants:

```text
Partial shipments · Backorders · Credit block · ATP shortage → MRP → PO
Failed delivery · Multi-warehouse · STO · Production demand · Returns
```

Each variant reuses ownership rules and post-condition style from §32.
