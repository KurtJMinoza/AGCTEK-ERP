# COD delivery + damage + Customer Returns

**Status:** Revised 2026-10-20 — **full payment at the door, no partial accept.** Customer Returns are customer-driven: Replace (orange) / Refund (red).
Revised 2026-10-21 — **RMA hand-off:** a storefront return opens a CRM case (ticket); the agent **approves or rejects** it on the case and CRM has SD apply the decision. Refund payment waits on finance (FICO).
**Scope:** Driver delivers the whole order (or fails the stop if the customer refuses), COD is collected in full, damage is evidence only, and any refund or replacement goes through a Customer Return the customer requests. Replacement and MM intake run on approve.

Related: [`SCM_DAMAGE_REPORT_DESIGN.md`](./SCM_DAMAGE_REPORT_DESIGN.md) (damage evidence), [`SCM_COURIERS.md`](./SCM_COURIERS.md) (3PL — courier COD blocked until remittance).

---

## Locked policy

### Outcomes at the door (own fleet, Deliver stop)

| # | Scenario | Stop | COD | Commercial follow-up |
|---|----------|------|-----|----------------------|
| 1 | Happy path — deliver all | `COMPLETED` | Collect full | None; SI = full |
| 2 | Damaged at the door, customer keeps it | `COMPLETED` | Collect full | Driver **Report damage** (evidence). Customer requests a **Refund** or **Replace** return |
| 3 | Refuse all | `FAILED` (customer reason) | No collect | No SI posting for this delivery; stock return-to-WH is ops |
| 4 | Hidden damage after the driver leaves | Already delivered | Already collected | Customer Return → **Refund (red)** or **Replace (orange)** |
| 5 | Replacement (after approve) | — | — | New pick / pack / SCM outbound |

### Customer Return choices

| Choice | Flag | `preferredResolution` | Outcome |
|--------|------|----------------------|---------|
| **Replace request** (storefront default) | **Orange** (`warning`) | `REPLACEMENT` | Approve (CRM case; SD only for returns without a case) → MM intake + `$0` child SO → Pick → Pack → SCM → POD |
| **Refund request** | **Red** (`danger`) | `REFUND` | Approve (CRM case) → MM intake; after inspection SD records the refund + credit memo; **paid by finance (FICO)** — not paid from SD or CRM |

### Locked rules

| Rule | Decision |
|------|----------|
| Partial accept | **Retired.** `deliverStop` rejects `acceptedLines`. Deliver all, or fail the stop when the customer refuses. |
| Payment / SI basis | **Full order.** COD is the full amount; the invoice is never rewritten at POD. |
| Damage at POD | **Evidence only** (driver Report damage after delivery). It never fails the stop and never auto-creates a return. |
| Commercial spine | **Customer Returns (`SdReturnRequest`) only**, requested by the customer (storefront: Delivered / Completed orders, Replace or Refund). |
| Driver authority | Deliver / fail and record collected cash. **Never** changes qty or price. |
| Stop types | Load (`SHIP`): no signature, fails only for vehicle issue / other. Return (`RETURN`): no signature, cannot fail. Deliver (`TO`): POD, signature, customer reasons, COD. Legacy stops without a type follow Deliver. |
| Replacement ≠ return pickup | Replacement is a new outbound after approve; damaged pickup as a trip stop is deferred. |
| CRM case | Each **storefront** return opens exactly one CRM ticket (`crm_tickets.sdReturnRequestId`, unique). Staff-entered returns and damage reports open none; staff can open one with **Open CRM case**. Routing is manual. |
| CRM authority | The agent **decides** a cased return on the ticket — approve (customer's Replace / Refund) or reject with a reason — with `crm.tickets` update. CRM has SD apply the decision (`fromCase`); SD refuses approve / reject from its own screen or API for a return with a case. CRM never writes stock, the return, or a refund. |
| Refund payment | Without FICO no refund is reported as paid: `POST …/returns/:id/refund/pay` is refused unless `SD_DEMO_REFUND_PAYMENT=true` (demo only; UI action needs `NEXT_PUBLIC_SD_DEMO_REFUND_PAYMENT=true`). Refund returns stay open until finance pays. |

### Legacy data (before 2026-10-20)

- `TripStop.codAmountDue` / `TripStopLine.acceptedQuantity` are no longer written. A stop partially accepted earlier and not yet paid still collects its reduced `codAmountDue`.
- Customer Returns with `refundStatus = NOT_REQUIRED` (old on-spot refuses) stay read-only: no Refund / Replace actions.

### Ownership

| Layer | Owner |
|-------|--------|
| Deliver / fail, COD collect, damage evidence | SCM + `apps/driver` |
| Customer Return, approve, refund flags | SD |
| Case queue (ticket), approve / reject decision | CRM (SD applies it; CRM reads SD status) |
| Intake / restock / scrap | MM |
| SI / payment | SD billing |
| Replacement fulfil | SD demand → MM pick / pack → SCM |

---

## What is in place

- **Deliver** `PATCH …/stops/:stopId/deliver` — `outcome` DELIVERED / FAILED; `acceptedLines` → 400. Stop-type rules in `trip-execution.rules.ts` (`assertStopTypeAllows`), also on `…/pod`.
- **Cash received** `POST …/stops/:stopId/cash-received` — full COD amount, idempotent `clientActionId`, allowed on an arrived or delivered stop. COD only exists on Deliver stops (drop-off shipments).
- **Damage evidence** — driver Report damage on a completed Deliver stop, or staff Report damage on a delivered shipment (`damage-reports`). Evidence only: the staff "Start return" hand-off (`initiate-return`) was removed 2026-10-20 — Customer Returns are opened only by the customer from their order.
- **Approve → MM + replacement** — `POST …/returns/:id/approve` opens MM `CustomerReturn` DRAFT intake; `REPLACEMENT` creates a `$0` child SO (`replacementSalesOrderId`, idempotent). Concurrent approvals converge on the same MM return (`CR-<requestNumber>`) and replacement order (`idempotencyKey replacement:<returnId>`). A retried approval whose replacement order failed to start (e.g. no pickable stock yet) confirms it and starts picking instead of reporting it as started.
- **Driver app** — Load / Deliver / Return screens with matching actions; no quantity controls.
- **Customer contact** — trip reads attach `contacts` (ship-to name + phone from SD `getShipToContacts`) only on open (PENDING / ARRIVED) deliver stops; the driver gets Call / SMS while the route is in transit. Load / return stops and finished stops never expose a phone.
- **Pending cash nudge** — leaving a delivered COD stop with cash unrecorded asks for confirmation; the trip screen lists delivered stops still awaiting cash.

## RMA hand-off (CRM case)

```text
Storefront: Request return (Replace | Refund)
  → SdReturnRequest REQUESTED
  → SD event ReturnRequestRequested (SD outbox) → CRM listener → CrmTicket (category RETURN, linked)
  → Agent: Tickets → open the case → Approve replacement   (Refund: approve + refund in SD; finance pays)
  → SD approve: MM CustomerReturn CR-… DRAFT (expects the package) + $0 replacement SO → Pick → Pack → SCM → POD
  → Agent closes the ticket
```

| Endpoint | Permission | Purpose |
|----------|-----------|---------|
| `POST /crm/tickets/from-return/:returnRequestId` | `crm.tickets` create | Open (or return) the case — repair when the hand-off failed; SD **Open CRM case** |
| `GET /crm/tickets/:id/return` | `crm.tickets` read | Return read live from SD (status, lines, MM return, replacement order) |
| `POST /crm/tickets/:id/return/approve` | `crm.tickets` update | Approve with the customer's resolution (Replace / Refund); SD opens the MM return (+ replacement order); one ticket comment; repeat-safe |
| `POST /crm/tickets/:id/return/reject` | `crm.tickets` update | Reject with a required `reason`; SD records it; one ticket comment; repeat-safe |
| `GET /crm/tickets?link=RETURN` | `crm.tickets` read | Return cases only (search also matches the return number) |

- The hand-off never fails the customer's request: if the CRM listener fails, SD logs it and the outbox row stays `PENDING`; open the case with **Open CRM case** or `npm run prisma:repair-crm-return-cases` (backfills REQUESTED storefront returns without a case).
- The ticket carries `sdReturnRequestId`, `salesOrderId` and `returnRequestNumber` (snapshots for lists); the return stays authoritative in SD. Ticket status is the agent's (approval does not move it).
- Decisions on a ticket run one at a time (row lock), so concurrent clicks leave one MM return, one replacement order and one comment.
- SD Customer Returns shows **CRM case · decided on the ticket** and hides Approve / Reject for such returns; it keeps the warehouse steps (receive, inspect, restock / damaged / scrap) and the refund record. Staff-entered returns without a case are still approved in SD.

### Ops checklist (agent)

1. **Tickets → Return cases** (or SD Customer Returns → **Open CRM case**). Open the ticket.
2. Review the return panel: items, reason, customer note, photos in SD if needed. Contact the customer from the ticket (comments / activities).
3. **Replace:** click **Approve replacement**. Check the panel shows the MM customer return (`CR-…`) and the replacement order (`SO-…`, no charge). If SD refuses (e.g. no material mapping or pickable stock), fix it and approve again — the retry finishes the replacement.
4. **Refund:** click **Approve refund return** (MM expects the package). After receipt and inspection, SD creates the refund; it shows *Pending finance* / *Approved · awaiting finance* until FICO pays it. Do not mark it paid.
5. **Reject:** click **Reject return** and enter the reason (recorded on the return and the ticket).
6. Track the replacement: warehouse picks/packs the replacement order, SCM delivers it; MM receives and inspects the returned goods (`CR-…`). Use **Refresh status** on the panel.
7. Close the ticket once the replacement is delivered (or the refund/rejection is settled).

## Demo seed

```bash
cd backend && npm run prisma:seed-cod-delivery-demo
```

| Key | Order / trip | State | Next step |
|-----|--------------|-------|-----------|
| **HAPPY** | `SO-COD-DEMO-HAPPY` / `TRP-COD-DEMO-HAPPY` | Drop-off `ARRIVED`, COD Pending Collection | Driver: deliver → collect full |
| **RPL** | `SO-COD-DEMO-RPL` | Delivered, paid; `RET-COD-DEMO-RPL` REQUESTED | SD Customer Returns → **Open CRM case** → **Approve replacement** (seeded returns are staff-entered, so no case opens by itself) |
| **RFD** | `SO-COD-DEMO-RFD` | Delivered, paid; `RET-COD-DEMO-RFD` REQUESTED | Customer Returns → Refund request (payment waits on finance) |

## QA

```bash
cd backend && npm run test:cod-delivery-qa
```

| # | Scenario | Asserted by |
|---|----------|-------------|
| 1 | Happy path — deliver with POD | `cod-delivery-customer-returns.scenarios` + `trips.service.execution` |
| 2 | Damaged at door — full payment, partial accept rejected | `trips.service.execution` + scenarios |
| 3 | Refuse all — fail with a customer reason | scenarios + `trips.service.execution` |
| 4 | Hidden damage — Refund / Replace return | scenarios + `return-request` |
| 5 | Replacement — MM intake + `$0` child SO | scenarios + `return-request` + `sales-order.replacement` |
| 6 | Storefront return → exactly one CRM case (retries / duplicate events) | `return-request` + `crm/tickets/return-cases` + `return-cases.pg-spec` |
| 7 | Replacement approved from the case; concurrent approvals → one MM return, one replacement order, one comment | `return-cases` + `return-cases.pg-spec` (`npm run test:pg`) |
| 8 | Refund never reported as paid without FICO | `return-request` (pay refused unless `SD_DEMO_REFUND_PAYMENT=true`) |
| — | Stop types — Load / Return rules | scenarios + `trips.service.execution` |
