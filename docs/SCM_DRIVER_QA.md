# SCM driver QA — own-fleet last mile

Acceptance script for the driver app (`apps/driver`) and customer tracking on own-fleet trips. Policy: full payment at the door, no partial accept — see [`COD_DELIVERY_CUSTOMER_RETURNS.md`](./COD_DELIVERY_CUSTOMER_RETURNS.md).

## Automated

```bash
cd backend && npm run test:driver-qa
```

Runs:

- `src/scm/trips` (execution rules and service);
- the TMS dispatch gates (`dispatch-windows.rules` and `tms-trips.service.location`);
- the public-position rules;
- `src/sd/order-tracking*`;
- the COD scenario suite.

## Scenarios

| # | Scenario | Expect | Automated check | Manual (device) |
|---|----------|--------|-----------------|-----------------|
| 1 | Arrive before Start route | Blocked; app says start the trip first | `trips.service.execution`: rejects execution when the trip is not IN_TRANSIT | Dispatched trip → open a stop → only "Start trip to begin execution" |
| 2 | Load stop | Confirm loaded; no signature, no COD; fails only for vehicle issue / other | `trips.service.execution`: load stop rules · scenarios: stop types | Cargo-first trip → stop #1 shows **Load**, button **Confirm loaded**, failure chips Vehicle issue / Other |
| 3 | Deliver, no COD | POD (photo + customer signature + location) → Confirm delivered → stop completed, shipment delivered with the same POD, geo on the COMPLETED event | `trips.service.execution`: deliver ARRIVED → COMPLETED | Prepaid order → Deliver stop → allow location → photo + signature → Confirm delivered |
| 4 | Deliver + COD | Deliver, then Cash received for the full amount; leaving early asks to confirm | `trips.service.execution`: cash received (COD) | `npm run prisma:seed-cod-delivery-demo` → `TRP-COD-DEMO-HAPPY` (driver01) → Confirm delivered → Cash received ₱1,000 |
| 5 | Deliver fail | Reason required (Other needs a note); trip continues to the next stop | `trips.service.execution`: fail stores reason, trip continues | Mark failed → pick a reason → next stop unlocks |
| 6 | Return stop | Confirm returned to hub; cannot fail | `trips.service.execution`: return stop cannot fail · scenarios | Last stop shows **Return**, button **Confirm returned to hub**, no failure chips |
| 7 | Tracking before Start route | Customer sees Ready for delivery, no map, no "stops away" | `order-tracking.service`: map off before the trip starts | Storefront order on a dispatched trip → tracking shows no map |
| 8 | Deliver without POD evidence | API rejects DELIVERED and names what is missing (signature, photo, location); failing the stop needs none | `trips.service.execution`: POD evidence (ISO §5) | Confirm delivered stays disabled until photo + signature; deny location on arrive and deliver → API error "location (GPS)…" |
| 9 | Dispatch over capacity | Validate / dispatch blocked with the capacity message | `tms-trips.service.location`: dispatch blocked when the load exceeds vehicle capacity | Load plan over the vehicle's item capacity → Dispatch → error |
| 10 | Dispatch with an unreachable window | Validate / dispatch blocked: "Delivery windows cannot be met … stop #N" | `dispatch-windows.rules` · `tms-trips.service.location`: delivery windows | Shipment with a latest delivery time 15 min from now → trip → Dispatch → error |

### POD rules (Deliver stops only)

A Deliver stop (`TO`, or legacy stops without a type) is DELIVERED only with all three:

- **Customer signature**: sent with Confirm delivered or saved earlier on the stop.
- **Photo** of the delivered goods: same.
- **Geo-tagged timestamp**: location on the deliver call, or a geo-tagged arrival on the stop's audit trail.

Load and Return stops need none of these. Damage found at the door is evidence only (Report damage after delivery) and never fails the stop.

### Dispatch window gate

When any stop has a delivery window, validate and dispatch re-run the route-preview schedule:

- **Legs** are haversine legs at `ROUTE_FALLBACK_SPEED_KMH`; OSRM is never called, so a router outage cannot block dispatch.
- **Service time** is `ROUTE_DEFAULT_SERVICE_MIN` at every stop except Return stops, which have none.
- **Departure** is the later of now and the trip's planned start.

Dispatch is blocked when a stop would finish after its window closes, or when its window opens too late for a later stop.

## Also covered

| Behavior | Automated check | Manual |
|----------|-----------------|--------|
| Partial accept rejected | `trips.service.execution`: partial accept is rejected | No quantity controls on Deliver stops |
| Customer phone only on open Deliver stops | `trips.service.execution`: ship-to contact | Active Deliver stop shows **Call / SMS**; gone after completion and on Load / Return |
| Stops away while in transit | `order-tracking.rules`: stopsBefore · `order-tracking.service`: stopsAway | Customer tracking shows "N stops before yours", then "Out for delivery — next stop" |
| Pending cash nudge | — (app UI) | Deliver a COD stop without Cash received → back asks to confirm; trip screen lists the stop |
| Stale GPS hidden | `public-position.rules` | Stop GPS pings → customer map shows "Waiting for a location update" |
