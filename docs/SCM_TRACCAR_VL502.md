# SCM vehicle GPS — Traccar + Jimi VL502 (optional / later)

> **Active decoder for local VL502 testing is flespi** — see **`docs/SCM_FLESPI_VL502.md`** (MQTT, no ngrok TCP).  
> This Traccar compose/docs path remains for optional self-hosted Huabao `:5015` later.

Traccar can decode Huabao; AGCTEK stores positions in **GpsLog** and shows them on **SCM Live Tracking** (Leaflet + OSM). Do not use Traccar’s map as the ERP map.

```text
VL502 --TCP Huabao--> Traccar :5015
  → JSON forward → Nest POST /scm/tracking/ingest
  → GpsLog
  → Live Tracking (/scm/tracking)
```

## Short facts

| Item | Value |
| --- | --- |
| Device | Jimi IoT **VL502** |
| Protocol | **Huabao** (packets start `0x7e`), **not** GT06 |
| Traccar port | **5015** (not 5023) |
| Identifier | **IMEI** = Traccar device `uniqueId` (for flespi use **14-digit** ident — see flespi doc) |
| Ingest auth | `TRACKING_INGEST_TOKEN` / `TRACCAR_INGEST_TOKEN` via `X-Traccar-Token` or Bearer |

## 1. Run Traccar

```bash
cd backend
docker compose -f docker-compose.traccar.yml up -d
```

- Web UI: http://localhost:8082 (create admin on first launch)
- Device TCP: `localhost:5015` (Huabao)

Also ensure Nest is up (`npm run start:dev` in `backend`) and `TRACCAR_INGEST_TOKEN` is set in `backend/.env`.

## 2. Register the device (same IMEI everywhere)

1. Read the VL502 IMEI (device label / SMS query per manual).
2. **Traccar** → Devices → Add → **Identifier** = IMEI (digits only, no spaces).
3. **AGCTEK** → Vehicles → set **Telematics device ID (IMEI)** to the **same** IMEI.

Optional seed: set `SEED_VL502_IMEI=<imei>` in `.env` and re-run `npx prisma db seed` to stamp the first vehicle.

## 3. Expose port 5015 for the cellular device (ngrok)

The tracker cannot reach `127.0.0.1`. Tunnel **only** Traccar’s Huabao port:

```bash
ngrok tcp 5015
```

Note the public host/port from ngrok (e.g. `0.tcp.ngrok.io:12345`).

Nest ingest stays on your LAN/localhost. The phone/SIM path is **device → ngrok → Traccar :5015** only.

## 4. SMS configure VL502 (from device manual)

Send as text SMS to the SIM in the VL502 (syntax may vary slightly by firmware; trailing `#` as documented):

```text
APN,apnname#
SERVER,1,<ngrok-host>,<ngrok-port>,0#
```

Examples:

```text
APN,internet#
SERVER,1,0.tcp.ngrok.io,12345,0#
```

- `1` = TCP  
- Host/port = ngrok TCP endpoint (not Nest `:3001`)  
- Confirm online in Traccar UI (device shows last update)

## 5. Point Traccar → Nest ingest

Edit `backend/traccar/traccar.xml` and uncomment `forward.*` (or set the same keys in the UI if your Traccar build supports it):

```xml
<entry key='forward.enable'>true</entry>
<entry key='forward.type'>json</entry>
<entry key='forward.url'>http://host.docker.internal:3001/scm/tracking/ingest</entry>
<entry key='forward.header'>X-Traccar-Token: YOUR_TOKEN_SAME_AS_ENV</entry>
```

Restart Traccar after editing XML:

```bash
docker compose -f docker-compose.traccar.yml restart
```

### Manual smoke test (without the device)

```bash
curl -X POST http://localhost:3001/scm/tracking/ingest ^
  -H "Content-Type: application/json" ^
  -H "X-Traccar-Token: YOUR_TOKEN" ^
  -d "{\"device\":{\"uniqueId\":\"YOUR_IMEI\"},\"position\":{\"latitude\":14.6,\"longitude\":121.0,\"speed\":10,\"course\":90,\"fixTime\":\"2026-09-07T01:00:00.000Z\",\"attributes\":{}}}"
```

Then open `/scm/tracking` — pin appears when none selected (all vehicles with a `GpsLog`).

## 6. What Nest stores

- `GpsLog`: lat, lng, speedKmh (knots→km/h from Traccar), heading, recordedAt, `rawPayload` (full forward JSON; odometer/ignition attributes if present)
- Unknown IMEI → `{ ignored: true }` + server warning (forwarder does not hard-fail)
- Live Tracking continues to read `GET /scm/tracking/fleet` + WebSocket; no second map product

## Out of scope

- ngrok as application code  
- Flespi / MQTT  
- Driver Expo GPS as primary vehicle tracker (optional phone ping remains separate)  
- OBD diagnostic UI  
- Opening Traccar UI as the ERP map
