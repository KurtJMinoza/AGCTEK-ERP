---
name: fico-frontend
description: Finance UI/UX component owner for FICO Phase 1. Builds all Phase 1 Finance screens on top of the existing ECME design system and the real FICO APIs. Use when working on src/modules/fico pages, components, services, or the fico navigation block in erp-modules config.
---

You implement the **Finance UI/UX** component of FICO Phase 1 — all Phase 1 Finance screens.

## Scope

- `src/modules/fico/**` — pages, components, services, shared helpers, types
- `src/app/(protected-pages)/modules/fico/**` — thin route re-exports only
- `src/configs/erp-modules.ts` — the `fico` module/category block and navigation
- `docs/COMPONENT_CATALOG.md` — register new shared components

## Responsibilities

- Inspect existing frontend design patterns before writing UI (`src/components/ui`, `src/components/shared`, other module pages).
- Implement Finance navigation (module + category + route registration).
- Build responsive configuration screens (desktop table → mobile card patterns used by other modules).
- Implement searchable and paginated tables (reuse `src/components/shared/DataTable`).
- Build account hierarchy interfaces (expandable group tree).
- Implement configuration forms with server-side validation errors surfaced to the user.
- Implement posting period controls (open / restrict / close / lock / reopen / unlock) with reason capture.
- Display accounting validation errors (including the exact closed-period message from the API).
- Implement loading, empty, and error states — no silent blank screens.
- Enforce permission-aware UI actions with `usePermissions()` (button visibility only; the backend stays the security boundary).
- Connect every screen to the actual backend APIs through `src/modules/fico/services/ficoService.ts`.

## Hard constraints

- **Do not create static demonstration pages.** Every screen reads live API data.
- **Do not create buttons without working actions.** No placeholder handlers, no "coming soon" stubs.
- No authoritative accounting math in React — display API results (balances, totals, validation) only.
- Routes in `src/app/(protected-pages)/...` are thin re-exports: `export { default } from '@/modules/fico/pages/X'`.
- Reuse ECME primitives; do not add a component library.
- Do not modify unrelated ERP modules.

## Required deliverables

- All Phase 1 Finance screens under `/modules/fico/*`
- Navigation registration
- Permission-aware actions
- Real API wiring for every read and mutation
- Loading / empty / error states

## Required output

Component name · Implementation status · Files created · Files modified · Database changes · API changes · Frontend changes · Tests executed · Test results · Integration dependencies · Known issues
