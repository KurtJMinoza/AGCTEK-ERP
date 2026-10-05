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
| POST | `/load-plans/:id/route-preview` `{ stopOrder?, departAt?, serviceTimeMin? }` | Stateless route / ETA preview; 400 unless READY (see below) |
| GET | `/trip-candidates` | READY plans with ≥ 1 line, no active trip; vehicle summary + stop preview |
| GET | `/trips?status=PLANNED,READY,DISPATCHED` | Cargo-first trips only |
| POST | `/trips` `{ loadPlanId, driverId?, plannedStartAt?, plannedEndAt?, notes?, stopOrder? }` | 409 unless plan READY; `stopOrder` = preview stop keys |
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

## Route preview (Trip Planning)

`POST /load-plans/:id/route-preview` — creates nothing (no Trip, TripStop, GPS session or
assignment). Confirm trip (`POST /trips`) stays the only persistence path.

1. Load plan must exist (404) and be READY (400).
2. Stops = `buildTripStops` on that plan's lines only (same as trip creation): PICKUP (SHIP,
   deduped by location; several distinct pickups are visited in order, `pickupCount > 1`) →
   SHIP TO (TO) → RETURN TO for line return locations → a final RETURN TO the first pickup
   warehouse (always added; carries any line returns to that warehouse, otherwise no lines —
   the last leg of the trip is the drive back). Stop `key` =
   `${stopType}|${locationKey}`; optional `stopOrder` reorders TO stops (`applyStopOrder`, same
   rules as persisted reorder).
3. Coordinates: cargo lat/lng snapshot; else Nominatim geocode of the address (not persisted,
   max 10 lookups, 5 s each; `ROUTE_PREVIEW_GEOCODE=false` disables). Still missing →
   `routable: false`, no polyline, `MISSING_COORDS` violations.
4. Routing: `routing/osrm.service.ts` (`OsrmService.getRoute`) calls OSRM `route/v1/driving`
   at `OSRM_BASE_URL` (timeout `OSRM_TIMEOUT_MS`, default 5000; never throws, returns `null`
   on unset URL / timeout / HTTP / routing error / leg-count mismatch). On `null`,
   `routing/haversine-route.ts` (`computeHaversineLegs`) estimates at
   `ROUTE_FALLBACK_SPEED_KMH` (default 40). The response carries `router` (`'osrm' | 'haversine'`;
   `null` only when blocked by missing coords), `routerFallbackReason`, `polyline` ([lat,lng]),
   totals, and `legDurationsSec` / `legDistancesM` (length = stops − 1). ETAs, windows and the
   recommended departure always use the legs of the same router as the polyline. HTTP 200 either
   way. The public `router.project-osrm.org` demo is for dev only — self-host OSRM in production.
5. Schedule (`tms/route-schedule.ts`, pure): departure = leaving the first PICKUP; arrival =
   departure + leg; EARLY waits until window start (`waitingTimeSec`); a window is met only
   when service **finishes** by the window end — otherwise LATE, keeping the real ETA, with
   `lateBySec` = service end − window end; service time `serviceTimeMin` (default `ROUTE_DEFAULT_SERVICE_MIN` or 30) at
   every stop except RETURN. Windows come from shipment earliest/latest delivery (TO stops).
6. Recommended departure: backward pass over latest service start `latest_i = min(windowEnd_i −
   service_i, latest_{i+1} − leg_i − service_i)`; latest departure that meets every window if still in the future
   (`LATEST_MEETING_WINDOWS`), otherwise now flagged `feasible: false` (`EARLIEST_PRACTICAL`);
   `NO_DEADLINES` when no stop has a window end. Windows that open after a downstream
   deadline allows → `WINDOW_CONFLICT`. `departureMode` (`ON_TIME` default | `EARLY`):
   EARLY instead departs so the truck reaches the first stop with a window start exactly as
   it opens (`EARLIEST_MEETING_WINDOWS`), capped by the ON_TIME latest departure and never
   before now. Any other value → 400.
7. ETAs are evaluated for `departAt` if given, else the recommended departure. `feasible` =
   no violations (`LATE`, `WINDOW_CONFLICT`, `MISSING_COORDS`, `DEPARTURE_IN_PAST`).

UI: `components/trips/TripRoutePreviewMap.tsx` (+ client-only `TripRoutePreviewLeaflet.tsx`),
hook `useTripRoutePreview` (no request without a load; 400 ms debounce). No WebSocket / GPS /
FleetMap coupling. OSRM → solid line; haversine → dashed line + "Estimated (no router)".

## Compatibility

Generated stops also write `TripStopShipment` rows (SHIP → `PICKUP`, TO → `DROPOFF`,
RETURN → `RETURN`), so the driver app, manifest, POD, goods issue and vehicle cargo views work
unchanged. Driver `deliverStop` settles `DROPOFF` links only.

## Trip execution (driver)

Existing routes under `/api/v1/scm/trips/:id` — `PATCH start`, `PATCH stops/:stopId/arrive`,
`PATCH stops/:stopId/pod`, `PATCH stops/:stopId/deliver`. Rules live in
`backend/src/scm/trips/trip-execution.rules.ts` (`validateStopExecution`), enforced in `TripsService`:

```text
Trip IN_TRANSIT (after start)
  stop PENDING --arrive--> ARRIVED --deliver (outcome DELIVERED)--> COMPLETED
                                   --deliver (outcome FAILED)----> FAILED
```

- Guard order on every arrive / pod / deliver: `x-driver-id` header = `trip.driverId` (403) →
  trip `IN_TRANSIT` (409 "Start the trip to begin execution") → stop on trip (404) → valid
  transition (409) → sequence (409 "Finish stop #n first") unless `Trip.allowOutOfOrder`.
  `start` also requires the assigned driver.
- COMPLETED / FAILED / SKIPPED are terminal — no driver reopen. POD drafts only while ARRIVED.
- FAILED requires `reasonCode` (`DeliveryFailureReason`: CUSTOMER_UNAVAILABLE, CUSTOMER_REFUSED,
  WRONG_ADDRESS, DAMAGED_GOODS, VEHICLE_ISSUE, PAYMENT_ISSUE, OTHER); `failureReason` note is
  required for OTHER. Stored on `TripStop.failureCode / failureReason / failedAt`.
- A failed stop does not end the trip; the trip still auto-completes once every stop is terminal.
- Shipment side effect on FAIL: linked PICKUP / DROPOFF shipments → `ShipmentStatus.EXCEPTION_HOLD`
  with `exceptionCode / exceptionNote / exceptionAt` (awaiting dispatcher re-attempt / return
  decision). No inventory posting. Trip completion never flips held shipments to DELIVERED.
- Audit: append-only `TripStopEvent` (ARRIVED / COMPLETED / FAILED) written in the same
  transaction as the stop change, with optional `latitude`, `longitude`, `accuracy`, `deviceId`,
  `clientOccurredAt` (stored as `occurredAt`; server `recordedAt`) and `reasonCode` / notes.
  Status writes are conditional on the expected stop status (concurrent requests → 409).
- Idempotency: optional `clientActionId` (unique). Replay of the same stop + action is a no-op;
  reuse for a different action → 409.
- `allowOutOfOrder` is set by the ERP via `PATCH /scm/trips/:id` only. The generic stop PATCH
  cannot set ARRIVED / COMPLETED / FAILED or edit terminal stops.
- `x-driver-id` is a client-asserted identity (repo-wide auth gap), not a token.
- Follow-ups: offline action queue + sync using `clientActionId`; SCM domain event (outbox) for
  `DeliveryFailed` once SCM adopts the outbox; dispatcher UI to resolve EXCEPTION_HOLD.

Tracking: `/scm/tracking/fleet` prefers IN_TRANSIT > DISPATCHED > ASSIGNED > READY > PLANNED;
the driver app active trip is IN_TRANSIT > DISPATCHED > ASSIGNED > PLANNED (legacy only).

## Data

`ShipmentLine`, `LoadPlan`, `LoadPlanLine`, `TripStopLine`; `Trip.loadPlanId / plannedEndAt /
dispatchedAt`; `TripStop.stopType / locationKey / warehouseId`; `TripStatus` += READY,
DISPATCHED. Migration `20261006120000_scm_tms_cargo_first` backfills one line per existing
shipment. MM package release creates one line per package item (weight split by qty).
Migration `20261008120000_scm_trip_stop_execution`: `Trip.allowOutOfOrder`,
`TripStop.failureCode / failedAt`, `Shipment.exception*`, `ShipmentStatus.EXCEPTION_HOLD`,
`TripStopEvent`.

## UI

- **Load Building** `/scm/load-building` — vehicle → capacity (capacity / used / remaining),
  available lines, assigned cargo, Validate → Mark ready. No routing.
- **Trip Planning** `/scm/trip-planning` — READY loads only → Plan route (route preview map,
  recommended departure, ETAs / windows, reorder deliveries) → Confirm trip (planned start and
  delivery order from the preview) → driver, Validate, Dispatch, Cancel.
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
