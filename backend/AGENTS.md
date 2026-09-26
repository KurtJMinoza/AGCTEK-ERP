# Backend Agent Instructions (NestJS)

Scope: `backend/` — API, Prisma, domain modules, tests.

**Global contract:** [../AGENTS.md](../AGENTS.md)  
**Master enterprise flow:** [../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md](../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md)

---

## Stack

- **NestJS** — `backend/src/`
- **Prisma** — `backend/prisma/schema.prisma`, migrations, seeds
- **MM module** — `backend/src/mm/` (authoritative for Materials Management)
- **API prefix** — `/api/v1` (`backend/src/main.ts`)

---

## Before you change backend code

1. Search `backend/src` for existing controllers, services, DTOs, guards.
2. For **any physical stock change**, locate `inventory-posting.service.ts` and callers—do not add alternate posting paths.
3. Run `npm run test:architecture` in `backend/` after **MM backend** changes (see `.cursor/rules/mm-architecture.mdc`).
4. Prefer extending `backend/src/mm/common/` (scope, events, idempotency) over new parallel infrastructure.

---

## Module layout (MM)

```text
backend/src/mm/
├── inventory/          ← MM-08 posting, balances, availability
├── materials/            ← MM-01
├── supplier/
├── warehouse/
├── planning/             ← MM-05 MRP (read-only stock)
├── purchase-*, rfq, procurement/
├── receiving/, inbound/  ← MM-07
├── inventory-control/
├── returns-disposal/
└── …
```

Register routes in the owning module’s `*.module.ts`; avoid orphan controllers.

---

## Prisma & seeds

- Schema changes → `prisma migrate dev` with reviewed SQL impact.
- MM demo reset: `npm run prisma:seed-mm-demo` (see `docs/MM_DEMO_WALKTHROUGH.md`).
- Do not duplicate models that overlap existing `Mm*` / `Wm*` tables.

---

## Testing

- Unit/integration: Jest under `backend/src/**/*.spec.ts`
- MM architecture guardrails: `npm run test:architecture`
- Report which commands were run; do not claim pass without execution.

---

## Canonical backend references

See [../docs/CANONICAL_PATTERNS.md](../docs/CANONICAL_PATTERNS.md) — posting service, MM module entry, auth, Prisma patterns.
