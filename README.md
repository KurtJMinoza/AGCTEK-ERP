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

Open [http://localhost:3000](http://localhost:3000). After sign-in, you'll land on the Home page.

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

API runs at [http://localhost:3001](http://localhost:3001)

Health check: [http://localhost:3001/health](http://localhost:3001/health)

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
