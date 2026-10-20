# SCM driver QA — own-fleet last mile

Acceptance script for the driver app (`apps/driver`) and customer tracking on own-fleet trips. Policy: full payment at the door, no partial accept — see [`COD_DELIVERY_CUSTOMER_RETURNS.md`](./COD_DELIVERY_CUSTOMER_RETURNS.md).

## Automated

```bash
cd backend && npm run test:driver-qa
```

Runs `src/scm/trips` (execution rules + service), the public-position rules, `src/sd/order-tracking*` and the COD scenario suite.

## Scenarios

| # | Scenario | Expect | Automated check | Manual (device) |
|---|----------|--------|-----------------|-----------------|
| 1 | Arrive before Start route | Blocked; app says start the trip first | `trips.service.execution`: rejects execution when the trip is not IN_TRANSIT | Dispatched trip → open a stop → only "Start trip to begin execution" |
| 2 | Load stop | Confirm loaded; no signature, no COD; fails only for vehicle issue / other | `trips.service.execution`: load stop rules · scenarios: stop types | Cargo-first trip → stop #1 shows **Load**, button **Confirm loaded**, failure chips Vehicle issue / Other |
| 3 | Deliver, no COD | POD (notes, photo, signature) → Confirm delivered → stop completed, shipment delivered | `trips.service.execution`: deliver ARRIVED → COMPLETED | Prepaid order → Deliver stop → POD → Confirm delivered |
| 4 | Deliver + COD | Deliver, then Cash received for the full amount; leaving early asks to confirm | `trips.service.execution`: cash received (COD) | `npm run prisma:seed-cod-delivery-demo` → `TRP-COD-DEMO-HAPPY` (driver01) → Confirm delivered → Cash received ₱1,000 |
| 5 | Deliver fail | Reason required (Other needs a note); trip continues to the next stop | `trips.service.execution`: fail stores reason, trip continues | Mark failed → pick a reason → next stop unlocks |
| 6 | Return stop | Confirm returned to hub; cannot fail | `trips.service.execution`: return stop cannot fail · scenarios | Last stop shows **Return**, button **Confirm returned to hub**, no failure chips |
| 7 | Tracking before Start route | Customer sees Ready for delivery, no map, no "stops away" | `order-tracking.service`: map off before the trip starts | Storefront order on a dispatched trip → tracking shows no map |

## Also covered

| Behavior | Automated check | Manual |
|----------|-----------------|--------|
| Partial accept rejected | `trips.service.execution`: partial accept is rejected | No quantity controls on Deliver stops |
| Customer phone only on open Deliver stops | `trips.service.execution`: ship-to contact | Active Deliver stop shows **Call / SMS**; gone after completion and on Load / Return |
| Stops away while in transit | `order-tracking.rules`: stopsBefore · `order-tracking.service`: stopsAway | Customer tracking shows "N stops before yours", then "Out for delivery — next stop" |
| Pending cash nudge | — (app UI) | Deliver a COD stop without Cash received → back asks to confirm; trip screen lists the stop |
| Stale GPS hidden | `public-position.rules` | Stop GPS pings → customer map shows "Waiting for a location update" |
