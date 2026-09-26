# AGCTEK ERP

Frontend: **Next.js + React + TypeScript**  
Backend: **NestJS + TypeScript + Fastify**

Build the ERP from scratch. Use **ECME only as the visual component library**.

## Architecture

```text
starter/
├── src/                 # Next.js frontend
│   ├── components/
│   │   ├── ui/          # ECME primitives
│   │   ├── shared/      # Reusable compositions
│   │   ├── layouts/
│   │   └── template/
│   └── app/             # Next.js routes
└── backend/             # NestJS API (Fastify)
    └── src/
```

See `AGENTS.md` and `docs/COMPONENT_CATALOG.md` for agent rules and preferred components.

## Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010). After sign-in, you'll land on the Home page.

Production hostname: [https://erp.agctek.co](https://erp.agctek.co) (`AUTH_URL` / `FRONTEND_URL` / `NEXT_PUBLIC_API_BASE_URL`). Cloudflare points at `:3010` (`erp-edge`), which proxies `/api/v1` + `/socket.io` to Nest `:3011` and everything else to Next `:3020`.

### Driver mobile (Expo)

Separate app at `apps/driver` for logistics execution (start route, stops, POD). See `apps/driver/README.md`.

```bash
npm run driver
# or: cd apps/driver && npm start
```

Demo login after `cd backend && npm run prisma:seed`: `driver01` / `123Qwe`

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:migrate
npm run start:dev
```

API runs at [http://localhost:3011](http://localhost:3011)

Health check: [http://localhost:3011/api/v1/health](http://localhost:3011/api/v1/health)

### Tile38 (standalone, no Docker)

Geofencing uses [Tile38](https://tile38.com). Binaries live under `tools/tile38` (Windows amd64).

```powershell
# from repo root
.\scripts\start-tile38.ps1
```

Default listen: `127.0.0.1:9851`. Point Nest at it via `TILE38_HOST` / `TILE38_PORT` / `TILE38_HOOK_BASE_URL` in `backend/.env`.

### Telematics (flespi — active)

Active path: **flespi** MQTT → Nest → `GpsLog` → SCM Live Tracking. See **`docs/SCM_FLESPI_VL502.md`**.

Set `FLESPI_TOKEN` + `FLESPI_CHANNEL_ID` in `backend/.env` (Nest dials out to `mqtt.flespi.io`; no inbound TCP tunnel).

Traccar / nginx `:5023` is **paused for now** (optional later — `docs/SCM_TRACCAR_VL502.md`, `docs/SCM_NGINX_TRACCAR.md`).

### SCM places autocomplete (Photon)

Address type-ahead uses **Photon** (OSM) via `GET /scm/places/search`, proxied by Nest so rate limits stay server-side.

```env
# backend/.env — public Photon is OK for local dev only
# PLACES_PROVIDER_URL=https://photon.komoot.io
# PHOTON_URL=https://photon.komoot.io
```

For production, point `PLACES_PROVIDER_URL` or `PHOTON_URL` at a **self-hosted Photon**. The UI (`LocationSearchField`) is provider-agnostic; swap the Nest mapper/interface without changing forms.

### Database (Prisma + PostgreSQL)

- ORM: **Prisma**
- Database: **PostgreSQL** (`agcerp`)
- Schema: `backend/prisma/schema.prisma`

Set your connection string in `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/agcerp?schema=public"
```

```bash
cd backend
npm run prisma:migrate   # apply migrations
npm run prisma:generate  # regenerate client
npm run prisma:studio    # open Prisma Studio
```
