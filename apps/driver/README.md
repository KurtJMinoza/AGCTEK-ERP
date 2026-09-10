# AGCTEK Driver (Expo)

Separate **React Native / Expo** client for SCM logistics execution (flow **5.1**, **5.5**, **6.x**).

This is **not** part of `src/modules/scm` (Next.js dispatcher UI). It talks to the existing NestJS API under `/scm`.

## Run

```bash
# Terminal 1 — Nest API (repo root)
cd backend
npm run start:dev

# Terminal 2 — Driver app
cd apps/driver
npm start
# or from repo root: npm run driver
```

Then press `a` (Android) / `i` (iOS) / scan QR with Expo Go.

### API URL

Default:

| Client | Base URL |
| --- | --- |
| iOS simulator / web | `http://localhost:3001` |
| Android emulator | `http://10.0.2.2:3001` |
| Physical device | set `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001` |

Example:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 npx expo start
```

## Auth

Nest currently has **no JWT**. Flow:

1. `POST /auth/sign-in` `{ userName, password }` → user
2. `GET /scm/drivers/me?userId=` → Driver profile (`Driver.userId`)

Store session in AsyncStorage. JWT can be added later without changing screens.

**Requirement:** the signed-in User must have a linked `Driver` row.

Seed a demo driver:

```bash
cd backend
npm run prisma:seed
```

Demo credentials (after seed): `driver01` / `123Qwe`

## Screens

| Screen | Purpose |
| --- | --- |
| Login | Sign-in + resolve Driver |
| Today | Active trip (`ASSIGNED` / `IN_TRANSIT`) |
| Trip | Stop list, **Start route** (5.1) |
| Stop | Arrive, manifest qty, POD photo/signature/notes, deliver/fail (5.5 / 6.x) |

Optional GPS: while `IN_TRANSIT`, posts to `POST /scm/tracking/ping` so **dispatcher Live Tracking** updates. **Primary vehicle tracker** for VL502 testing is **flespi** (MQTT) → GpsLog — see `docs/SCM_FLESPI_VL502.md`. Traccar remains optional.

## APIs used

| Method | Path |
| --- | --- |
| POST | `/auth/sign-in` |
| GET | `/scm/drivers/me?userId=` |
| GET | `/scm/trips/active?driverId=` |
| GET | `/scm/trips/:id` |
| PATCH | `/scm/trips/:id/start` |
| PATCH | `/scm/trips/:id/stops/:stopId/arrive` |
| PATCH | `/scm/trips/:id/stops/:stopId/pod` |
| PATCH | `/scm/trips/:id/stops/:stopId/deliver` |
| POST | `/scm/tracking/ping` (optional) |

## Out of scope

- Dispatcher map / load planning / capacity monitor (web only)
- Demand Planning, MM, FICO, VRP
- Second GPS/map platform
- Offline POD queue (online-first MVP; AsyncStorage queue later)

## Structure

```text
apps/driver/
  app/           # Expo Router screens
  src/
    api/         # Nest fetch wrappers
    types/
    hooks/
    components/  # RN only
```
