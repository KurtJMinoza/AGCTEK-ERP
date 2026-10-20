# COD delivery + damage + Customer Returns

**Status:** Revised 2026-10-20 — **full payment at the door, no partial accept.** Customer Returns are customer-driven: Replace (orange) / Refund (red).
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
| **Replace request** | **Orange** (`warning`) | `REPLACEMENT` | Approve → MM intake + `$0` child SO → Pick → Pack → SCM → POD |
| **Refund request** | **Red** (`danger`) | `REFUND` | Refund / credit memo flow |

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

### Legacy data (before 2026-10-20)

- `TripStop.codAmountDue` / `TripStopLine.acceptedQuantity` are no longer written. A stop partially accepted earlier and not yet paid still collects its reduced `codAmountDue`.
- Customer Returns with `refundStatus = NOT_REQUIRED` (old on-spot refuses) stay read-only: no Refund / Replace actions.

### Ownership

| Layer | Owner |
|-------|--------|
| Deliver / fail, COD collect, damage evidence | SCM + `apps/driver` |
| Customer Return, approve, refund flags | SD |
| Intake / restock / scrap | MM |
| SI / payment | SD billing |
| Replacement fulfil | SD demand → MM pick / pack → SCM |

---

## What is in place

- **Deliver** `PATCH …/stops/:stopId/deliver` — `outcome` DELIVERED / FAILED; `acceptedLines` → 400. Stop-type rules in `trip-execution.rules.ts` (`assertStopTypeAllows`), also on `…/pod`.
- **Cash received** `POST …/stops/:stopId/cash-received` — full COD amount, idempotent `clientActionId`, allowed on an arrived or delivered stop. COD only exists on Deliver stops (drop-off shipments).
- **Damage evidence** — driver Report damage on a completed Deliver stop, or staff Report damage on a delivered shipment (`damage-reports`). Evidence only: the staff "Start return" hand-off (`initiate-return`) was removed 2026-10-20 — Customer Returns are opened only by the customer from their order.
- **Approve → MM + replacement** — `POST …/returns/:id/approve` opens MM `CustomerReturn` DRAFT intake; `REPLACEMENT` creates a `$0` child SO (`replacementSalesOrderId`, idempotent).
- **Driver app** — Load / Deliver / Return screens with matching actions; no quantity controls.
- **Customer contact** — trip reads attach `contacts` (ship-to name + phone from SD `getShipToContacts`) only on open (PENDING / ARRIVED) deliver stops; the driver gets Call / SMS while the route is in transit. Load / return stops and finished stops never expose a phone.
- **Pending cash nudge** — leaving a delivered COD stop with cash unrecorded asks for confirmation; the trip screen lists delivered stops still awaiting cash.

## Demo seed

```bash
cd backend && npm run prisma:seed-cod-delivery-demo
```

| Key | Order / trip | State | Next step |
|-----|--------------|-------|-----------|
| **HAPPY** | `SO-COD-DEMO-HAPPY` / `TRP-COD-DEMO-HAPPY` | Drop-off `ARRIVED`, COD Pending Collection | Driver: deliver → collect full |
| **RPL** | `SO-COD-DEMO-RPL` | Delivered, paid; `RET-COD-DEMO-RPL` REQUESTED | Customer Returns → Replace request |
| **RFD** | `SO-COD-DEMO-RFD` | Delivered, paid; `RET-COD-DEMO-RFD` REQUESTED | Customer Returns → Refund request |

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
| 5 | Replacement — MM intake + `$0` child SO | scenarios + `return-request` |
| — | Stop types — Load / Return rules | scenarios + `trips.service.execution` |
