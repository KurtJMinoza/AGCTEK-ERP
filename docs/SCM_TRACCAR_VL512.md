# SCM vehicle GPS — Traccar + Jimi VL512 (Windows + nginx)

Windows-native path for **VL512**: nginx TCP stream → Traccar GT06 **:5023** → Nest ingest → **GpsLog** → SCM Live Tracking.

Do **not** use Docker Compose for this path. Do **not** use Huabao port **5015** (that is for VL502). Do not use Traccar’s map as the ERP map.

```text
VL512 --TCP GT06--> nginx :5023 --> Traccar 127.0.0.1:5023
  → JSON forward → Nest POST /scm/tracking/ingest
  → GpsLog
  → Live Tracking (/scm/tracking)
```

Sample configs in-repo:

- [`backend/traccar/nginx-stream-vl512.conf`](../backend/traccar/nginx-stream-vl512.conf)
- [`backend/traccar/traccar.xml`](../backend/traccar/traccar.xml) (forward comments for native Windows)

## Short facts

| Item | Value |
| --- | --- |
| Device | Jimi IoT **VL512** |
| Protocol | **GT06** (packets start `7878` / `7979`), **not** Huabao/`7e` |
| Traccar port | **5023** (not 5015) |
| Edge | nginx for Windows **`stream`** module |
| Identifier | **Full IMEI** = Traccar `uniqueId` = `Vehicle.telematicsDeviceId` |
| Ingest auth | `TRACKING_INGEST_TOKEN` / `TRACCAR_INGEST_TOKEN` via `X-Traccar-Token` or Bearer |
| Host | Windows on-prem (native Traccar service) |

## 1. Install Traccar (Windows service)

1. Install Java (version required by your Traccar release).
2. Install Traccar from the official Windows package; start the **Traccar** Windows service.
3. Open the UI: http://localhost:8082 (create admin on first launch).
4. Confirm GT06 is listening (default **5023**, or **25023** if remapped for nginx as below).

Prefer giving nginx the public **5023** and moving Traccar’s GT06 listener to an internal port (recommended on Windows when Traccar already claimed 5023):

```xml
<entry key='gt06.port'>25023</entry>
```

Then nginx `proxy_pass 127.0.0.1:25023` (see [`nginx-stream-vl512.conf`](../backend/traccar/nginx-stream-vl512.conf)). Device SMS still uses public **5023**.

Alternatives: leave Traccar on `0.0.0.0:5023` and skip nginx (firewall only), or put nginx on another public port and SMS that port instead.

Do **not** run `docker compose -f docker-compose.traccar.yml` for this setup.

## 2. nginx TCP stream (Windows)

1. Install **nginx for Windows** built with `ngx_stream_module` (`nginx -V` should mention `stream`).
2. Copy [`backend/traccar/nginx-stream-vl512.conf`](../backend/traccar/nginx-stream-vl512.conf) into your nginx `conf/` folder (or keep a copy and adjust the include path).
3. In the main `nginx.conf`, add a top-level `stream` block that includes the file (stream is **not** inside `http { }`):

```nginx
stream {
    include nginx-stream-vl512.conf;
}
```

4. Test and reload from an elevated prompt in the nginx directory:

```bat
nginx -t
nginx -s reload
```

5. Windows Firewall: allow inbound **TCP 5023** (or your alternate public listen port).

From another network:

```powershell
Test-NetConnection <public-or-lan-host> -Port 5023
```

## 3. Register the device (same IMEI everywhere)

1. Read the VL512 IMEI (device label / SMS query per manual).
2. **Traccar** → Devices → Add → **Identifier** = IMEI (digits only, no spaces).
3. **AGCTEK** → Vehicles → set **Telematics device ID** to the **same** full IMEI.

Optional seed: set `SEED_VL502_IMEI=<full-imei>` in `backend/.env` (reuse this env name for VL512; no separate seed var) and re-run `npx prisma db seed` to stamp the first vehicle.

## 4. Point Traccar → Nest ingest

Ensure Nest is up (`npm run start:dev` in `backend`) and `TRACKING_INGEST_TOKEN` (or `TRACCAR_INGEST_TOKEN`) is set in `backend/.env`.

Edit Traccar’s `conf/traccar.xml` on the Windows install (you can start from the sample in this repo). Uncomment `forward.*`:

```xml
<entry key='forward.enable'>true</entry>
<entry key='forward.type'>json</entry>
<entry key='forward.url'>http://127.0.0.1:3001/api/v1/scm/tracking/ingest</entry>
<entry key='forward.header'>X-Traccar-Token: YOUR_TOKEN_SAME_AS_ENV</entry>
```

If Nest runs on another machine, use that host’s **LAN IP** instead of `127.0.0.1`.

Restart the Traccar Windows service after editing XML.

### Manual smoke test (without the device)

PowerShell:

```powershell
curl.exe -X POST http://127.0.0.1:3001/api/v1/scm/tracking/ingest `
  -H "Content-Type: application/json" `
  -H "X-Traccar-Token: YOUR_TOKEN" `
  -d "{\"device\":{\"uniqueId\":\"YOUR_IMEI\"},\"position\":{\"latitude\":14.6,\"longitude\":121.0,\"speed\":10,\"course\":90,\"fixTime\":\"2026-09-07T01:00:00.000Z\",\"attributes\":{}}}"
```

Then open `/scm/tracking` — pin appears when none selected (all vehicles with a `GpsLog`).

## 5. SMS configure VL512

Send as text SMS to the SIM in the VL512 (syntax per device manual; trailing `#` as documented):

```text
APN,<apn>#
SERVER,1,<public-host>,5023,0#
```

Examples:

```text
APN,internet#
SERVER,1,gps.example.com,5023,0#
```

Or mode `0` with a raw IP:

```text
SERVER,0,203.0.113.10,5023#
```

- Host/port = **nginx public** endpoint (not Nest `:3001`)
- Port must be **5023** (GT06), not 5015
- Confirm online in Traccar UI (device shows last update)

## 6. Verify end-to-end

1. Traccar logs: inbound hex starts with `7878` or `7979`. If you see `7e`, wrong protocol/port (Huabao/5015).
2. Traccar UI: device online, last update refreshing.
3. Nest logs: ingest accepted (not `unknown_device`).
4. DB: new `GpsLog` rows; UI pin on `/scm/tracking`.

## What Nest stores

- `GpsLog`: lat, lng, speedKmh (knots→km/h from Traccar), heading, recordedAt, `rawPayload` (full forward JSON)
- Unknown IMEI → `{ ignored: true }` + server warning
- Live Tracking continues to read fleet API + WebSocket; no second map product

## Out of scope

- Docker Compose Traccar  
- flespi MQTT (see `docs/SCM_FLESPI_VL502.md` for VL502 testing)  
- Exposing Traccar UI (`8082`) publicly without auth / VPN  
- Plaspy adapter  
