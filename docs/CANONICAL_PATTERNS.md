# Canonical ERP Patterns

Before inventing a new pattern, **find and follow** the references below.

---

## Backend — Materials Management

| Concern | Canonical path |
| --- | --- |
| Module root | `backend/src/mm/mm.module.ts` |
| **Inventory posting (sole physical writer)** | `backend/src/mm/inventory/inventory-posting.service.ts` |
| Architecture tests | `backend/src/mm/architecture/` → `npm run test:architecture` |
| MM common (scope, events) | `backend/src/mm/common/` |
| Prisma MM models | `backend/prisma/schema.prisma` (`Mm*`, `Wm*`) |
| Demo seed / reset | `backend/prisma/seed-mm-reset.ts`, `docs/MM_DEMO_WALKTHROUGH.md` |

---

## Backend — Auth & app

| Concern | Canonical path |
| --- | --- |
| Auth API | `backend/src/auth/auth.controller.ts`, `auth.service.ts` |
| App bootstrap / API prefix | `backend/src/main.ts` |

---

## Frontend — MM module

| Concern | Canonical path |
| --- | --- |
| Module pages | `src/modules/mm/<domain>/pages/` |
| Thin Next route | `src/app/(protected-pages)/modules/mm/...` |
| Navigation | `src/configs/erp-modules/mm.module.ts`, `src/configs/navigation.config` |
| Lazy filter refs (avoid fetch loops) | `src/modules/mm/shared/useLazyMmRefs.ts` |
| Reference CRUD shell | `src/modules/mm/material-master/components/RefCrudPage.tsx` |
| API client pattern | `src/modules/mm/<domain>/services/*Service.ts` |
| Axios base (ERP) | `src/services/axios/ErpAxiosBase.ts` |

---

## Frontend — Shared UI

| Concern | Canonical path |
| --- | --- |
| List + table | `src/components/shared/DataTable`, `AdaptiveCard`, `PageHeader` |
| Forms in dialogs | `src/components/shared/FormDialog`, `src/components/ui/Form` |
| Status | `src/components/shared/StatusBadge` |
| ECME primitives | `src/components/ui/*` |
| Component index | `docs/COMPONENT_CATALOG.md` |

---

## Frontend — Auth

| Concern | Canonical path |
| --- | --- |
| NextAuth | `src/auth.ts`, `src/configs/auth.config.ts` |
| Sign-in / Sign-up UI | `src/components/auth/SignIn/`, `src/components/auth/SignUp/` |
| Auth layout | `src/components/layouts/AuthLayout/Split.tsx` |

---

## Agent & domain docs

| Concern | Path |
| --- | --- |
| Global agent contract | `AGENTS.md` |
| Backend agents | `backend/AGENTS.md` |
| Frontend agents | `src/AGENTS.md` |
| MM skill | `.cursor/skills/materials-management/SKILL.md` |
| MM architecture | `docs/MM_ARCHITECTURE.md`, `docs/MM_FORBIDDEN_PATTERNS.md` |

When adding a feature, locate the **closest row** above and copy structure, naming, and validation—not a new parallel pattern.
