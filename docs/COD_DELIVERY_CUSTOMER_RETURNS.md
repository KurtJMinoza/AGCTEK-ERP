# COD delivery + optional damage + Customer Returns

**Status:** Phase 0 locked (2026-10-16). Phases 1–2 implemented. Phase 3+ not started.  
**Scope:** On-spot COD authority (accept qty + collect), Customer Returns as the single commercial follow-up, SI/payment tied to what was paid. Replacement and MM intake are downstream after approve.

Related: [`SCM_DAMAGE_REPORT_DESIGN.md`](./SCM_DAMAGE_REPORT_DESIGN.md) (evidence + prior Sales Returns handoff — commercial spine moves to Customer Returns per Phase 2).

---

## Phase 0 — Locked policy

Confirmed: `1A 2A 3A 4A 5C 6A` + locked rules below.

### Commercial outcomes at the door

| # | Scenario | Stop | COD | Commercial follow-up |
|---|----------|------|-----|----------------------|
| 1 | Happy path — accept all, no damage | `COMPLETED` | Collect full | None; SI = full |
| 2 | Partial accept — reject damaged qty | `COMPLETED` (not FAILED) | Collect for **accepted** qty only | DamageReport evidence + **Customer Return** for rejected qty |
| 3 | Refuse all | `FAILED` | No collect | No SI for this delivery; stock return-to-WH is ops |
| 4 | Accept all including damaged (pay full) | `COMPLETED` | Collect full | Optional note only — **no** credit return |
| 5 | Hidden damage after driver leaves | Already delivered | Already collected | Customer Return later → refund/credit |
| 6 | Replacement (after approve) | — | — | New pick/pack/SCM outbound; optional pickup stop for damaged |

### Locked rules

| Rule | Decision |
|------|----------|
| On-spot reject | **Yes.** Customer may refuse damaged lines and pay only for accepted qty. |
| Keep damaged + pay less | **Disallowed.** Either pay full & keep, or don’t pay & don’t keep (reject those units). |
| SI / payment basis | **Amount collected / accepted qty.** Prefer net = collected; do not leave SI full when only partial COD was taken. |
| Commercial spine | **Customer Returns (`SdReturnRequest`) only.** DamageReport is evidence. Redirect/alias the Sales Returns handoff; do not grow a second long-term product. |
| Replacement approve | Reuse current Customer Return approve for now; add a stricter REPLACEMENT permission later if needed. |
| Driver authority | May set **accepted qty** and record collected cash. **Never** change unit price. |
| Partial ≠ failed stop | Partial accept = delivered + report/return for the rest. `FAILED` / `DAMAGED_GOODS` remains true non-delivery. |
| Replacement ≠ return pickup | Replacement is a new outbound after approve. Pickup of damaged is a separate stop/type when scheduled. |

### Ownership

| Layer | Owner |
|-------|--------|
| COD collect + partial deliver + damage evidence | SCM + `apps/driver` |
| Customer Return + approve + refund flags | SD |
| Intake / restock / scrap | MM |
| SI / payment match | SD billing |
| Replacement fulfill | SD demand → MM pick/pack → SCM |

### Non-goals (this programme)

- Driver authorizing commercial policy beyond allowed outcomes
- Merging MM intake into the SD request table
- Holding all COD deliveries until a damage window expires
- Building Sales Returns as a separate long-term product

---

## Phase plan

| Phase | Exit |
|-------|------|
| **0** Policy one-pager | This document — written rules everyone uses |
| **1** Driver: COD amount + partial accept + optional damage | Driver can complete COD partial without marking the whole stop failed |
| **2** Wire to `SdReturnRequest` (Customer Returns) | On-spot damage and later customer request share one return backbone |
| **3** Payment + SI = collected / accepted | No systematic “collected 8 / invoiced 10” without a credit document |
| **4** Approve → MM intake + replacement pick/pack/SCM | Demo: 2 damaged COD partial → return → optional replacement ship |
| **5** QA scenarios 1–6 | Scripted demo passes |

---

## Phase 1 — shipped (implementation)

- **Deliver** `PATCH …/stops/:stopId/deliver` accepts optional `acceptedLines: [{ shipmentLineId, acceptedQuantity }]`. Omit or accept full qty = today’s full deliver. Refuse-all (every accepted = 0) is rejected — use `FAILED`.
- Rejected qty creates a driver **DamageReport** (idempotent `pod-reject:{stopId}:{lineId}`) after shipments are `DELIVERED`; stop stays `COMPLETED`.
- **TripStop.codAmountDue** stores proportional COD due (accepted/shipped × payment amount). **TripStopLine.acceptedQuantity** records POD accept on cargo-first stops.
- **Cash received** uses `codAmountDue` when set; SD reduces the payment amount to that due, then marks Paid.
- **Driver app:** Accepted qty steppers on ARRIVED drop-offs; cash sheet shows the reduced due after partial deliver.
- Migration: `20261016120000_pod_acceptance_cod`.

## Phase 2 — shipped (Customer Returns spine)

- `SdReturnRequest.damageReportId` (unique) links evidence → commercial return.
- `POST …/damage-reports/:id/initiate-return` creates a **Customer Return** (`REQUESTED`), not a new Sales Return. Legacy Sales Returns already linked are returned unchanged.
- Driver-sourced / POD reject reports set `refundStatus = NOT_REQUIRED` (COD never collected for rejected qty).
- POD partial accept auto-creates DamageReport **and** initiates the Customer Return after deliver.
- SCM damage dialog links to `/modules/sd/customer-returns`.
- Migration: `20261016140000_damage_to_customer_return`.

### Still next

- Phase 3: SI qty/amount = accepted/collected (POD still issues full SI today).
- Phase 4: approve → MM intake + replacement outbound.
- Phase 5: scripted scenarios 1–6.

### Known gap until Phase 3

POD still emits `shipment.delivered` → issue SI for the order. Partial accept may temporarily leave SI ahead of collected cash until Phase 3 aligns invoice/payment to accepted qty.
