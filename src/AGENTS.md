# Frontend Agent Instructions (Next.js + ECME)

Scope: `src/` — App Router, modules, shared UI, client services.

**Global contract:** [../AGENTS.md](../AGENTS.md)

---

## ERP + ECME model

ECME is the **UI kit only**. Business logic lives in modules and the **backend API**.

| Layer | Location |
| --- | --- |
| ECME primitives | `src/components/ui` |
| App shell | `src/components/layouts`, `src/components/template` |
| Shared ERP UI | `src/components/shared` |
| Domain | `src/modules/*` |
| Routes | `src/app` — **thin** re-exports |

---

## Non-negotiable UI rules

1. **Reuse** `src/components/ui` and `src/components/shared` before new UI.
2. **Do not** add another component library without approval.
3. **Rarely edit** ECME primitives; prefer shared/module components.
4. Cross-module UI → `src/components/shared`; domain-only → `src/modules/<name>/components`.
5. **No authoritative stock math in React** — display API results only.

**Cursor rules:** `.cursor/rules/erp-ui.mdc`, `.cursor/rules/erp-modules.mdc`

---

## Module layout

```text
src/modules/<module>/
├── pages/
├── components/
├── services/     ← API clients (axios to backend)
├── hooks/
└── types/
```

App route pattern:

```tsx
export { default } from '@/modules/accounting/pages/Dashboard'
```

Register new pages in `src/configs/navigation.config` (and ERP module configs e.g. `src/configs/erp-modules/`).

---

## Page composition

```text
PageContainer / PageHeader → filters → summary cards → DataTable / forms / charts
```

Prefer: `DataTable`, `AdaptiveCard`, `FormDialog`, `StatusBadge`, existing charts.

**MM list pages:** use lazy reference hooks (`useMmFilterRefs`, `useLazyMmRefs`) to avoid fetch loops—see `src/modules/mm/shared/useLazyMmRefs.ts`.

---

## API calls

- Base URL: `NEXT_PUBLIC_API_BASE_URL` → typically `http://localhost:3001`
- MM paths: `/api/v1/mm/...`
- Mutations may require session/`X-User-Id` — follow existing axios interceptors in module services.

---

## Auth pages

- NextAuth config: `src/auth.ts`, `src/configs/auth.config.ts`
- Auth UI: `src/components/auth/`, `src/app/(auth-pages)/`

---

## Catalog

See [../docs/COMPONENT_CATALOG.md](../docs/COMPONENT_CATALOG.md).

Canonical MM UI patterns: [../docs/CANONICAL_PATTERNS.md](../docs/CANONICAL_PATTERNS.md).
