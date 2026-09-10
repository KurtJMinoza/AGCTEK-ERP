# SCM vehicle GPS — flespi + Jimi VL502 (active for local testing)

**flespi** is the active protocol decoder for VL502 testing. Nest stays local; **GpsLog** is the system of record; **SCM Live Tracking** (Leaflet + OSM) is the ERP map. Do not use TrackIt/TracSeek/flespi UI as the dispatcher map.

Traccar (`docker-compose.traccar.yml` + `docs/SCM_TRACCAR_VL502.md`) remains optional for later self-hosted decoding — not required for this slice. No ngrok TCP / VPS needed when using flespi MQTT.

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
# or FLESPI_INGEST_TOKEN / TRACCAR_INGEST_TOKEN
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

## Out of scope

- flespi UI inside `src/modules/scm`
- TrackIt / TracSeek / second map product
- OBD diagnostic console
- Requiring Traccar `:5015` or ngrok TCP for this test path
