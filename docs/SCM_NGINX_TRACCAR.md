# SCM telematics — nginx stream + Traccar (Jimi VL512 / GT06)

> **Paused.** Active telematics is **flespi** — see **`docs/SCM_FLESPI_VL502.md`**.  
> Do not start the Windows `traccar` service or `nginx-telematics` unless you intentionally revive this path.  
> Nest ingest still accepts Traccar-shaped JSON if something posts to `/scm/tracking/ingest`.

## Flow

```text
VL512 --TCP GT06--> nginx :5023 --> Traccar 127.0.0.1:15023
  --> JSON forward --> Nest POST /api/v1/scm/tracking/ingest
  --> GpsLog --> SCM Live Tracking
```

## On this machine (done)

| Piece | Detail |
| --- | --- |
| nginx | `tools/nginx/nginx-1.28.0` — `stream` listen **5023** |
| Traccar | `gt06.port=15023`, forward to Nest with `X-Traccar-Token` |
| Nest | `TRACKING_INGEST_TOKEN` in `backend/.env` (must match forward header) |
| PM2 | app `nginx-telematics` in `ecosystem.config.cjs` |

## Still required for cellular devices

This host is behind NAT. Pick **one**:

1. **Router port-forward:** WAN TCP **5023** → `192.168.50.99:5023` (or your LAN IP)
2. Cloudflare **Spectrum** TCP → origin `:5023`
3. `ngrok tcp 5023`

DNS (optional): `gps.agctek.co` → public IP, **DNS only** (grey cloud). Do **not** orange-cloud TCP.

## SMS (VL512)

```text
APN,<your-apn>#
SERVER,1,<public-host-or-ip>,5023#
```

## Smoke test (no device)

```powershell
curl -X POST http://127.0.0.1:3011/api/v1/scm/tracking/ingest `
  -H "Content-Type: application/json" `
  -H "X-Traccar-Token: change-me-ingest-secret" `
  -d '{\"device\":{\"uniqueId\":\"YOUR_IMEI\"},\"position\":{\"latitude\":14.6,\"longitude\":121.0,\"speed\":10,\"course\":90,\"fixTime\":\"2026-09-23T01:00:00.000Z\",\"attributes\":{}}}'
```

Register the same IMEI in Traccar Devices and AGCTEK Vehicle → Telematics device ID.
