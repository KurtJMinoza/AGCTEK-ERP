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
