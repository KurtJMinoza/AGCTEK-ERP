# SCM Tile38 — standalone (Windows)

Prefer a **native Tile38 binary** for local geofencing. Nest talks RESP to `TILE38_HOST:TILE38_PORT` and does not require Docker.

```text
Nest Tile38Service  --RESP-->  tile38-server :9851
tile38-server SETHOOK POST -->  Nest /api/v1/scm/tracking/geofence-hook
```

Docker Compose (`backend/docker-compose.tile38.yml`) remains optional/legacy only.

## Short facts

| Item | Value |
| --- | --- |
| Binary | Official Windows amd64 zip from [Tile38 releases](https://github.com/tidwall/tile38/releases) |
| Default listen | **9851** |
| Env | `TILE38_HOST`, `TILE38_PORT`, `TILE38_HOOK_BASE_URL` |
| Hook base | `http://127.0.0.1:3001/api/v1` (include Nest global prefix) |

## 1. Install (Windows)

Example layout used on this machine:

```text
%LOCALAPPDATA%\tile38\tile38-<version>-windows-amd64\tile38-server.exe
%LOCALAPPDATA%\tile38\data\
```

Download and extract (PowerShell):

```powershell
$ver = "1.38.0"
$dest = Join-Path $env:LOCALAPPDATA "tile38"
$zip = Join-Path $env:TEMP "tile38-$ver-windows-amd64.zip"
$url = "https://github.com/tidwall/tile38/releases/download/$ver/tile38-$ver-windows-amd64.zip"
New-Item -ItemType Directory -Force -Path $dest,(Join-Path $dest "data") | Out-Null
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $dest -Force
```

## 2. Run

```powershell
$root = Join-Path $env:LOCALAPPDATA "tile38\tile38-1.38.0-windows-amd64"
$data = Join-Path $env:LOCALAPPDATA "tile38\data"
Set-Location $root
.\tile38-server.exe -d $data -p 9851
```

Leave that window open, or register it as a Windows service / scheduled task if you want it always on.

Smoke check with the bundled CLI:

```powershell
.\tile38-cli.exe
tile38> PING
```

## 3. Nest `.env`

```env
TILE38_HOST=127.0.0.1
TILE38_PORT=9851
TILE38_HOOK_BASE_URL=http://127.0.0.1:3001/api/v1
```

Do **not** use `host.docker.internal` for this path.

Restart Nest after changing env. Logs should show `Tile38 connected at 127.0.0.1:9851`.

## 4. Verify from Nest

With Nest up and Tile38 running:

1. Create/update a circular geofence in SCM Live Tracking.
2. Confirm Nest can SET geofence objects (no `Tile38 unavailable` warnings).
3. Ingest a GPS ping near the fence; optional hook POST hits `/api/v1/scm/tracking/geofence-hook`.

## Out of scope

- Committing the Tile38 binary into this repo  
- Requiring Docker for geofencing  
- Exposing Tile38 publicly (keep it on localhost / private LAN)
