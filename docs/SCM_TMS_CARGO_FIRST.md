# SCM TMS — Cargo-first Load Building → Trip Planning

```text
Shipments (READY) → ShipmentLine
  → Load Building: LoadPlanLine on a vehicle (capacity enforced) → LoadPlan READY
  → Trip Planning: trip from READY plan only; stops derived from cargo lines
  → driver → validate → dispatch → driver app start (MM goods issue) → tracking
```

**Rule:** Trip Planning never creates cargo or picks shipments. Stops come only from
`ShipmentLine → LoadPlanLine → ship-from / ship-to / return` of that vehicle's plan.

## Domain rules (MVP)

| Rule | Where enforced |
| --- | --- |
| 1 vehicle ↔ 1 active load plan | Partial unique index `LoadPlan_vehicle_active_key` + service check (409) |
| 1 load plan ↔ 1 non-cancelled trip | Partial unique index `Trip_loadPlan_active_key` + READY→ASSIGNED conditional update |
| 1 vehicle / driver ↔ 1 active trip | `TmsTripsService.assertVehicleFree` / `assertDriverUsable` |
| 1 shipment line ↔ ≤ 1 load plan line, no splitting | `LoadPlanLine.shipmentLineId @unique`; `assignedQty` must equal line qty |
| Capacity: Σ qty ≤ `capacityQty`; weight / volume only when the vehicle limit > 0 | `checkLoadCapacity` in a transaction holding `SELECT … FOR UPDATE` on the plan |
| Stops deduped by (location key, stop type); order SHIP → TO → RETURN | `buildTripStops` |
| Planner may move TO stops only | `validateStopReorder` |
| No manual stops on cargo-first trips | `TripsService.addStop/removeStop` reject when `loadPlanId` is set |

Pure rules: `backend/src/scm/tms/tms.rules.ts` (unit tests: `tms.rules.spec.ts`).

## Locations

| Stop type | Source on `ShipmentLine` | Location key |
| --- | --- | --- |
| SHIP | `shipFromWarehouseId` (Warehouse master) else `shipFromAddress` | `WH:<id>` / `ADDR:<normalised>` |
| TO | `shipToAddress` + lat/lng snapshot | `ADDR:<normalised>` |
| RETURN | `returnWarehouseId` else `returnAddress` — only when the line has one | `WH:<id>` / `ADDR:<normalised>` |

TO stops are ordered by earliest delivery window, then first appearance. No default
return-to-warehouse stop is added.

## Status machines

```text
LoadPlan: DRAFT ⇄ VALIDATED → READY → ASSIGNED (trip created) → DISPATCHED → COMPLETED
          DRAFT/VALIDATED/READY → CANCELLED (lines released)
          VALIDATED/READY → DRAFT (reopen, only without a trip)
          ASSIGNED/DISPATCHED → READY (trip cancelled or deleted)
          Any cargo edit on VALIDATED → DRAFT

Trip (cargo-first): PLANNED ⇄ READY → DISPATCHED → IN_TRANSIT → COMPLETED
          READY → PLANNED when stops are reordered or driver / planned window changes
          PLANNED/READY/DISPATCHED → CANCELLED (load plan back to READY)
```

Legacy trips (no `loadPlanId`) keep DRAFT → PLANNED → ASSIGNED → IN_TRANSIT. The generic
`PATCH /scm/trips/:id/status` only allows DISPATCHED → IN_TRANSIT, IN_TRANSIT → COMPLETED
and cancel for cargo-first trips.

Shipment status: READY until **all** its lines are on load plans, then ASSIGNED; IN_TRANSIT /
DELIVERED via the existing trip start / delivery flow.

## API (`/api/v1/scm/tms`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/load-plans?status=&vehicleId=&active=true&search=` | With `capacity` summary |
| POST | `/load-plans` `{ vehicleId, notes? }` | 409 if vehicle has an active plan |
| GET | `/load-plans/:id` | |
| GET | `/shipment-lines/available?search=` | Lines of READY shipments not on any plan |
| POST | `/load-plans/:id/lines` `{ shipmentLineId, assignedQty? }` | Editable plan, line free, full qty, capacity |
| DELETE | `/load-plans/:id/lines/:lineId` | |
| POST | `/load-plans/:id/validate` | DRAFT → VALIDATED |
| POST | `/load-plans/:id/ready` | VALIDATED → READY |
| POST | `/load-plans/:id/reopen` | VALIDATED/READY → DRAFT |
| POST | `/load-plans/:id/cancel` | Releases lines |
| GET | `/trip-candidates` | READY plans with ≥ 1 line, no active trip; vehicle summary + stop preview |
| GET | `/trips?status=PLANNED,READY,DISPATCHED` | Cargo-first trips only |
| POST | `/trips` `{ loadPlanId, driverId?, plannedStartAt?, plannedEndAt?, notes? }` | 409 unless plan READY |
| GET | `/trips/:id` | Stops include `lines` (cargo refs) |
| PATCH | `/trips/:id` `{ driverId?, plannedStartAt?, plannedEndAt?, notes? }` | PLANNED/READY only |
| PATCH | `/trips/:id/stops/sequence` `{ stopIds: [...] }` | Full ordered list |
| POST | `/trips/:id/validate` | PLANNED → READY: driver, license, vehicle, capacity, stop ↔ cargo coverage |
| POST | `/trips/:id/dispatch` | READY → DISPATCHED; load plan → DISPATCHED |
| POST | `/trips/:id/cancel` | Before IN_TRANSIT |

Execution reuses `/scm/trips`: `PATCH /:id/start` (DISPATCHED → IN_TRANSIT, posts MM goods
issue), stop arrive / POD / deliver, `PATCH /:id/status` COMPLETED (load plan → COMPLETED).

**Deprecated** (kept for API compatibility, removed from UI, log a warning):
`POST /scm/trips/assign-load`, `POST /scm/trips` with shipment stops.

## Compatibility

Generated stops also write `TripStopShipment` rows (SHIP → `PICKUP`, TO → `DROPOFF`,
RETURN → `RETURN`), so the driver app, manifest, POD, goods issue and vehicle cargo views work
unchanged. Driver `deliverStop` settles `DROPOFF` links only.

Tracking: `/scm/tracking/fleet` prefers IN_TRANSIT > DISPATCHED > ASSIGNED > READY > PLANNED;
the driver app active trip is IN_TRANSIT > DISPATCHED > ASSIGNED > PLANNED (legacy only).

## Data

`ShipmentLine`, `LoadPlan`, `LoadPlanLine`, `TripStopLine`; `Trip.loadPlanId / plannedEndAt /
dispatchedAt`; `TripStop.stopType / locationKey / warehouseId`; `TripStatus` += READY,
DISPATCHED. Migration `20261006120000_scm_tms_cargo_first` backfills one line per existing
shipment. MM package release creates one line per package item (weight split by qty).

## UI

- **Load Building** `/scm/load-building` — vehicle → capacity (capacity / used / remaining),
  available lines, assigned cargo, Validate → Mark ready. No routing.
- **Trip Planning** `/scm/trip-planning` — READY loads only → Create trip → generated stops,
  reorder deliveries, driver, Validate, Dispatch, Cancel.
- **Trips** `/scm/trips` — execution / history; cargo-first trips link back to Trip Planning.
- **Tracking** — unchanged; dispatched / in-transit trips show as the vehicle's active trip.

## Seed

`npm run prisma:seed-tms` (backend) — idempotent: VEH-TMS-01 with READY `LP-SEED-01`
(41/60 items, SHIP → TO → TO → RETURN), VEH-TMS-02 with trip `TRP-TMS-SEED-02` (PLANNED,
generated stops), `TMS-SHP-006` left for Load Building.

## Out of scope

VRP / traffic optimisation, multi-vehicle trips, line splitting, peak dynamic load along
multi-leg routes (`checkLoadCapacity` is the extension point), FICO, auth guards / company
scope (TMS-wide gap, unchanged).
