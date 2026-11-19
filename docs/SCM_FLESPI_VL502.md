# SCM vehicle GPS — flespi + Jimi VL502 (active)

**flespi** is the active protocol decoder. Nest stays local; **GpsLog** is the system of record; **SCM Live Tracking** (Leaflet + OSM) is the ERP map. Do not use TrackIt/TracSeek/flespi UI as the dispatcher map.

No ngrok TCP / VPS needed when using flespi MQTT.

```text
VL502 --TCP--> flespi channel (protocol_id = concox)
        --> Nest MQTT subscribe mqtt.flespi.io (preferred)
        --> GpsLog
        --> Live Tracking (/scm/tracking)

Fallback: flespi HTTP stream → POST /scm/tracking/ingest
          (needs Nest reachable — e.g. HTTP ngrok — only if not using MQTT)
```

## Short facts

| Item | Value |
| --- | --- |
| Device | Jimi IoT **VL502** (JT808 / Huabao flavor) |
| flespi channel protocol | **`concox`** |
| Channel URI | Unique **DNS host:port** from flespi (use hostname, not IP) |
| Device ident | **First 14 digits of IMEI** (drop last digit) |
| AGCTEK field | `Vehicle.telematicsDeviceId` = that **14-digit** ident |
| Preferred ingest | Nest MQTT → `mqtt.flespi.io:8883` (outbound only) |
| Note | Device often sends position **only when moving** |

## 1. flespi channel + device

1. Create a channel with protocol **`concox`**.
2. Copy the channel **URI** (host + port) — SMS will use this DNS name.
3. Note the numeric **channel id** → `FLESPI_CHANNEL_ID`.
4. Create a flespi token with access to that channel → `FLESPI_TOKEN`.
5. Register the device with **ident = first 14 digits of IMEI**.

Confirm messages in the flespi **Toolbox** before expecting Nest to log anything.

## 2. SMS configure VL502

```text
APN,<apn>#
SERVER,1,<flespi-host>,<flespi-port>,0#
```

Example:

```text
APN,internet#
SERVER,1,example.flespi.io,12345,0#
```

Use the flespi channel DNS hostname (not a raw IP). `1` = TCP.

## 3. Nest env (MQTT — preferred)

In `backend/.env`:

```env
FLESPI_TOKEN=your_flespi_token
FLESPI_CHANNEL_ID=1438873
FLESPI_MQTT_HOST=mqtt.flespi.io
FLESPI_MQTT_PORT=8883

# HTTP ingest fallback (stream / curl)
TRACKING_INGEST_TOKEN=change-me-ingest-secret
# or FLESPI_INGEST_TOKEN
```

Restart Nest. Logs should show `Flespi MQTT connected` and `Subscribed flespi/message/gw/channels/{id}/+`.

If token/channel are missing, MQTT stays disabled and the API still boots.

## 4. Register ident on the vehicle

AGCTEK → Vehicles → **Telematics device ID** = **14-digit** flespi ident (same as Toolbox).

Optional seed:

```env
SEED_VL502_IMEI=86000000000000
```

(`SEED_VL502_IMEI` may be 14-digit ident or 15-digit IMEI; Nest matches both.)

## 5. HTTP stream fallback (optional)

If you prefer flespi → HTTP instead of MQTT:

1. Point a flespi stream at `https://<reachable-host>/scm/tracking/ingest`
2. Header: `X-Flespi-Token: <TRACKING_INGEST_TOKEN>` (or Bearer)
3. Body: single message, array, or `{ "result": [ ... ] }` / `{ "messages": [ ... ] }`

Localhost-only Nest needs an **HTTP** tunnel for this path; MQTT does not.

### Smoke test

```bash
curl -X POST http://localhost:3001/scm/tracking/ingest ^
  -H "Content-Type: application/json" ^
  -H "X-Flespi-Token: YOUR_INGEST_SECRET" ^
  -d "{\"ident\":\"86000000000000\",\"timestamp\":1725680000,\"position.latitude\":14.6,\"position.longitude\":121.0,\"position.speed\":40,\"position.direction\":90}"
```

Then open `/scm/tracking` — pin appears with other GPS vehicles when none selected.

## 6. What Nest stores

- `GpsLog`: lat, lng, speedKmh, heading, recordedAt, `rawPayload` (flespi message)
- Unknown ident → `{ ignored: true }` + warning
- MQTT disconnects reconnect with backoff; they do **not** crash the API

## 7. Ocular trips (trip-first, SCM → CRM)

Field ocular runs are planned and tracked in **SCM** as a `Trip` with `purpose = OCULAR`. CRM has **no** ocular activity type; it only receives leads.

- `GET /scm/vehicles/available[?from&to]` lists vehicles with no overlapping reserving trip (PLANNED/READY/DISPATCHED/ASSIGNED/IN_TRANSIT). Without a window every in-service vehicle is returned.
- `POST /scm/ocular-trips` creates the run (vehicle + window + optional driver/notes). `PATCH /scm/ocular-trips/:id` edits it. No load plan, shipments or goods issue.
- Stops (`TripStop`) are in **manual order**: `POST :id/stops`, `PATCH :id/stops/:stopId`, `PATCH :id/stops/sequence` (`{ stopIds }`), `DELETE :id/stops/:stopId`, `PATCH :id/stops/:stopId/status` (ARRIVED / COMPLETED / SKIPPED, trip must be started). A stop may reference an existing lead/customer (`existingLeadId`, `customerId`: soft references, visit only).
- **Pickup and dropoff points:** a stop has a `type` of `PICKUP` (stored as `TripStop.stopType = SHIP`) or `DROPOFF` (default, `TO`; these are the visits). Pickups always sort before dropoffs (create and add place them first; reorder is rejected if a dropoff precedes a pickup). Pickups can only be added before the trip starts, can be marked ARRIVED / COMPLETED while the trip is still PLANNED, and cannot be skipped. **The trip cannot start (`IN_TRANSIT`) until every pickup is COMPLETED** (409 from `PATCH /scm/trips/:id/status` and from the generic trip update). Dropoffs are worked only after the trip starts, and leads are captured at dropoffs only. The trip auto-completes when every stop of a running trip is done or skipped.
- **Route preview:** `GET /scm/ocular-trips/:id/route-preview?departureMode=EARLY|ON_TIME&departAt=<ISO>&serviceTimeMin=<n>` routes the stops in manual order (OSRM, haversine fallback when `OSRM_BASE_URL` is unset) and runs the same schedule algorithm as the delivery preview (`scm/tms/route-schedule.ts`): per-stop ETA, visit time, waiting, window status, violations, and a recommended start (shown only before the trip starts). The trip window end is the deadline for each stop; the start defaults to the actual start, else the planned window start, and `departAt` overrides it. **Return leg:** when the first located stop is a pickup (and at least one more stop is located), `returnToOrigin` (default `true`, `false` to switch off) adds the empty drive back to that first pickup, like the delivery trip's RETURN stop: it is part of the polyline, distance, drive time and the final arrival (`arrivalAt`, `returnStop`), has no visit time or window, and is never saved as a stop (so the start gate and auto-complete rules are unchanged). Planning only; nothing is persisted.
- Start / cancel / complete use `PATCH /scm/trips/:id/status`; the trip auto-completes when every stop is done or skipped. List with `GET /scm/trips?purpose=OCULAR`.
- **Create lead from a stop:** the UI calls CRM `POST /crm/leads` with `originTripStopId`; CRM forces `source = OCULAR`, stores `originTripStopId`, and emits `crm.lead.captured-at-ocular-stop`; SCM links `TripStop.createdLeadId` (idempotent). Duplicate stops capture is rejected (409). After that, follow-up is normal CRM activities (call / task / meeting).
- Live position is the normal path above: vehicle `telematicsDeviceId` → `GpsLog`; `/scm/tracking?purpose=OCULAR&tripId=…` filters the map, which shows the selected unit's stop markers.
- Leads from ocular runs: CRM leads list, filter `source = OCULAR`.

## Out of scope

- flespi UI inside `src/modules/scm`
- TrackIt / TracSeek / second map product
- OBD diagnostic console
- Requiring ngrok TCP for the MQTT test path
