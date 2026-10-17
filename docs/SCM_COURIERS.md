# SCM Couriers (3PL) sub-module

**Status:** Phase 0 locked (2026-10-17). Phase 1 done (schema, carrier master, book API). Phase 2 done (UI + manual status with goods issue / delivery side effects). Phase 3 remaining: customer tracking branch + SD courier projection.
**Scope:** After pack, a customer shipment goes out by **own fleet** (existing trip / driver / POD) or by a **third-party courier** (parcel 3PL). Couriers owns partner last-mile — carrier master, consignment, tracking number, courier status, and later the carrier API. It does **not** own vehicles, trips, drivers, routing, or GPS.

Related: [`SCM_PROCESS_FLOW.md`](./SCM_PROCESS_FLOW.md) (MM → SCM handoff), [`SCM_TMS_CARGO_FIRST.md`](./SCM_TMS_CARGO_FIRST.md) (own-fleet load / trip), [`COD_DELIVERY_CUSTOMER_RETURNS.md`](./COD_DELIVERY_CUSTOMER_RETURNS.md) (own-fleet COD).

---

## Phase 0 — Locked scope

| Decision | Locked |
|----------|--------|
| v1 scope | Parcel 3PL only. Not freight forwarding. |
| Integration | **Manual first** — dispatcher pastes the tracking number (AWB). First carrier API only when a contract / API exists. |
| Execution branch | Every customer shipment is `OWN_FLEET` or `THIRD_PARTY`. Decided in SCM after release, not at packing. |
| Goods issue | Posted when the consignment reaches **PICKED_UP** (physical handover to the courier). Not at BOOKED, so a cancelled booking needs no reversal. |
| COD via courier | **Not in MVP.** COD orders cannot take the `THIRD_PARTY` path until remittance exists. Own-fleet COD stays on the driver path. |
| Remittance | 3PL COD payout reconciliation — Phase 5, after tracking works, separate from own-fleet cash. Added when partners actually collect COD. Lifts the COD block above. |
| Adapter | One `CarrierAdapter` interface so J&T / Ninja Van / Lalamove can be added without changing the shipment model. |
| Status | One normalized courier status set; UI and storefront never read vendor codes. |

### Target flow

```text
SO → Pick → Pack → Package READY_FOR_DISPATCH → SCM Shipment READY
                                                   │
        ┌──────────────────────────────────────────┴──────────────────────┐
        │ OWN_FLEET (unchanged)                                            │ THIRD_PARTY (Couriers)
        │ Load → Trip → trip start = GI → driver → POD                     │ Ship with courier → BOOKED (AWB)
        │ trip complete → shipment.delivered                               │ PICKED_UP = GI
        │                                                                  │ IN_TRANSIT → OUT_FOR_DELIVERY
        │                                                                  │ DELIVERED → shipment.delivered
        │                                                                  │ or EXCEPTION / RETURNED
        └──────────────────────────────────────────────────────────────────┘
```

### OWN_FLEET vs THIRD_PARTY rules

| Rule | OWN_FLEET | THIRD_PARTY |
|------|-----------|-------------|
| Load building / trip planning | Eligible when `READY` | **Excluded** (never offered for a truck) |
| Driver app / Traccar / GPS | Yes | No |
| Goods issue trigger | Trip start (`issueGoodsForTripShipments`) | Consignment → `PICKED_UP` |
| Delivered trigger | Trip complete → `shipment.delivered` | Consignment → `DELIVERED` → `shipment.delivered` |
| Proof of delivery | Driver POD | Courier status (+ optional POD URL from carrier) |
| COD | Driver collects (existing) | Blocked in MVP |
| Customer tracking | Trip-based timeline + map | Carrier + tracking number + courier events, no map |
| Switching mode | Only while shipment is `READY` and not on a load plan / trip | Only while consignment is not yet `PICKED_UP` |

### Normalized courier status

```text
BOOKED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
   any state before DELIVERED → EXCEPTION | RETURNED
   BOOKED → CANCELLED (before pickup only)
```

| Courier status | Shipment status | Side effect |
|----------------|-----------------|-------------|
| BOOKED | `READY` (unchanged) | — |
| PICKED_UP | `DISPATCHED` | Post MM goods issue (idempotent on `Shipment.goodsIssueId`) → package `DISPATCHED` |
| IN_TRANSIT / OUT_FOR_DELIVERY | `IN_TRANSIT` | — |
| DELIVERED | `DELIVERED` + `deliveredAt` | Emit `shipment.delivered` |
| EXCEPTION | `EXCEPTION_HOLD` | Dispatcher decision |
| RETURNED | `RETURNED` | Return-to-warehouse is ops (MM intake), not automatic |
| CANCELLED | `READY` again | Allowed only before PICKED_UP |

`ShipmentStatus` already has every target value — no enum change.

---

## Reuse (do not duplicate)

| Need | Existing owner — reuse it |
|------|---------------------------|
| Stock leaves the books | `GoodsIssueService.issueAndPostFromPackage` (MM). Emits `goods-issue.posted` → SD sets order `SHIPPED`, stamps `shippedAt`, drafts SI (`sd-fulfillment-events.listener.ts`). |
| Order delivered + invoice posts | `shipment.delivered` event → SD `onShipmentDelivered`. Couriers emits the same event; SD needs no new code. |
| Shipment from package | `ShipmentsService.createFromPackage` (unchanged; creates `READY`). |
| Shipment status vocabulary | `ShipmentStatus` enum (unchanged). |

### Single source for the tracking number

Three places hold carrier / tracking today:

| Field | Today | After Couriers |
|-------|-------|----------------|
| `WmPackage.carrier`, `trackingNumber` | Free text at packing | Prefill only for "Ship with courier"; not authoritative |
| `SdSalesOrder.courierName`, `trackingNumber` | Manual SD DTO; read by delivery monitor | Projection written from the consignment; stop manual edits for courier orders |
| `CourierConsignment` | — | **Authoritative** carrier + tracking + booking |

### Gaps to close while building

- **Done (P1):** load building `availableLines` filters to `OWN_FLEET`; adding a line, planning a trip and assigning shipments reject `THIRD_PARTY`.
- **Done (P1):** generic `PATCH /scm/shipments/:id` rejects status / POD edits on `THIRD_PARTY` shipments; delete is blocked while a consignment exists.
- Open (P3): `order-tracking.rules.ts` derives IN_TRANSIT only from a started trip. Add a courier branch for `THIRD_PARTY` shipments.

### Phase 1 API

| Endpoint | Permission | Behavior |
|----------|------------|----------|
| `GET /scm/carriers` (`search`, `isActive`) · `GET /scm/carriers/:id` | `scm.couriers` or `scm.consignments` read | List / detail with consignment count |
| `POST /scm/carriers` · `PATCH /scm/carriers/:id` | `scm.couriers` create / update | Code upper-cased; `API` integration rejected until P4; tracking template must be http(s) with `{tracking}` |
| `DELETE /scm/carriers/:id` | `scm.couriers` delete | Blocked when consignments exist (deactivate instead) |
| `GET /scm/consignments` (`status`, `carrierId`, `search`) · `GET /scm/consignments/:id` | `scm.consignments` read | Includes carrier, shipment, `trackingUrl`; detail adds events |
| `POST /scm/consignments` `{ shipmentId, carrierId, trackingNumber, externalBookingId?, notes? }` | `scm.consignments` create | Ship with courier — see rules below |

Booking rules: shipment must be a `READY` customer delivery, not on a load plan or active trip, not already booked; carrier must be active; COD orders rejected. One transaction sets `executionMode = THIRD_PARTY`, creates (or re-books a `CANCELLED`) consignment as `BOOKED`, and appends a `BOOKED` / `MANUAL` event. Duplicate tracking number per carrier → 409. Shipment detail and list (`GET /scm/shipments`) include `courierConsignment`.

### Phase 2 — status + UI

`PATCH /scm/consignments/:id/status` `{ status, occurredAt?, note?, podUrl? }` (`scm.consignments` update). Detail returns `nextStatuses`.

| Move | Side effect |
|------|-------------|
| → PICKED_UP | `GoodsIssueService.issueAndPostFromPackage` (skipped if the shipment has no package or already has a GI); package → `DISPATCHED`. GI failure rejects the move and leaves the consignment unchanged. |
| → DELIVERED | Shipment `DELIVERED` + `deliveredAt`; emits `shipment.delivered` (SD delivers the order, posts the invoice). Optional `podUrl`. |
| → EXCEPTION | Shipment `EXCEPTION_HOLD` with the note. Before pickup it can only go to PICKED_UP or CANCELLED; after pickup never back to PICKED_UP / CANCELLED. |
| → CANCELLED (before pickup only) | Shipment back to `READY` and `OWN_FLEET`; can be re-booked. |

Every move appends a `MANUAL` event; the claim is optimistic on the current status (concurrent edit → 409); `occurredAt` cannot be in the future.

UI (`src/modules/scm`): **Couriers** (`/scm/couriers`, carrier master with active toggle), **Consignments** (`/scm/consignments`, list + detail dialog with status update and history), **Shipments** gains a "Carried by" column and **Ship with courier** on READY own-fleet deliveries. Nav badges count new consignments / couriers.

---

## Data model (Phase 1)

| Model | Fields |
|-------|--------|
| `Shipment` (extend) | `executionMode` (`OWN_FLEET` default \| `THIRD_PARTY`) |
| `Carrier` (new) | `code` (unique), `name`, `isActive`, `supportsCod`, `integrationType` (`MANUAL` \| `API`), `trackingUrlTemplate` |
| `CourierConsignment` (new, 1:1 with `Shipment`) | `shipmentId` (unique), `carrierId`, `trackingNumber`, `externalBookingId`, `labelUrl`, `status`, `bookedAt`, `pickedUpAt`, `deliveredAt`, `podUrl`, `notes`, `createdBy` |
| `CourierConsignmentEvent` (new) | `consignmentId`, `status`, `occurredAt`, `source` (`MANUAL` \| `WEBHOOK` \| `POLL`), `rawStatus`, `payload` (JSON), `idempotencyKey` (unique) |

Indexes: `(carrierId, trackingNumber)` unique when tracking is set; `(status)`; event `(consignmentId, occurredAt)`.

Seed carriers (all `MANUAL`, `supportsCod=false` until remittance): J&T Express, LBC, Ninja Van, Flash Express, Lalamove, DHL.

## Ownership

| Piece | Owner |
|-------|-------|
| Carrier master, consignment, events, booking API, webhook | SCM Couriers |
| Package contents, pack, goods issue posting | MM (Couriers calls GI; never writes stock) |
| Trip / fleet / driver / GPS | Existing SCM — own fleet only |
| Order status, invoice, customer tracking page | SD (via existing events + SCM tracking projection) |

Permissions: new resource codes `scm.couriers` (carrier master) and `scm.consignments` (dispatcher), menu entries under SCM → Transportation Management.

---

## Build order

| Phase | Deliverable | Exit |
|-------|-------------|------|
| P0 | This document | Rules written (done) |
| P1 | Schema + migration + carrier seed; Carrier CRUD API | Carriers CRUD; shipment can be set `THIRD_PARTY` with a consignment (done) |
| P2 | UI: Carriers, Consignments list / detail (timeline, manual status), "Ship with courier" from Shipment | Dispatcher runs the full 3PL path without a trip (done; GI on PICKED_UP and `shipment.delivered` pulled in from P3) |
| P3 | SD + storefront tracking branch (carrier + AWB + courier events); SD `courierName` / `trackingNumber` projection | Customer sees carrier + AWB; SD order shows the courier |
| P4 | `CarrierAdapter` (`book`, `track`, `cancel`) + one live carrier + webhook → events | Book + auto status for one carrier; others stay MANUAL |
| P5 | Labels, cancel booking, exception queue, more adapters, **COD remittance** (lifts COD block), optional rate shop | — |

## Non-goals

- Driver app, Traccar / GPS, load building, or route optimization for courier parcels
- Every PH courier on day one
- Courier COD before remittance (P5)

## Success criteria

- Shipment can be `OWN_FLEET` or `THIRD_PARTY`; own-fleet flow unchanged
- Manual AWB + status works with zero courier API
- PICKED_UP posts exactly one goods issue; DELIVERED delivers the SD order and posts the invoice through the existing events
- Courier shipments never appear in load building / trip planning
- COD orders cannot take the courier path until remittance ships
- A second adapter needs no schema change
