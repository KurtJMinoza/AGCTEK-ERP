# ERP + ECME Architecture

This project is an **ERP built from scratch** that uses the **ECME template only as the UI/component library**.

## Source of truth

| Layer | Location | Purpose |
| --- | --- | --- |
| ECME primitives | `src/components/ui` | Button, Card, Input, Dialog, Table, Tabs, Badge, etc. |
| ECME app shell | `src/components/layouts`, `src/components/template` | Auth/post-login layouts, nav, theme |
| Shared compositions | `src/components/shared` | DataTable, Chart, ConfirmDialog, PageHeader, etc. |
| Domain modules | `src/modules/*` | Accounting, procurement, inventory, HR, payroll, … |
| Next.js routes | `src/app` | Thin route shells that import module pages |

## Non-negotiable UI rules

1. **Always reuse existing components.** Inspect `src/components/ui` and `src/components/shared` before writing UI.
2. **ECME is the primary UI kit.** Do not install another UI library without explicit approval.
3. **Never recreate an existing ECME component.**
4. **Do not modify ECME UI primitives** unless necessary for a bug fix or approved design-system change.
5. **Keep UI consistent** across all modules (spacing, typography, Card/Table/Form patterns).
6. New reusable components belong in:
   - `src/components/shared` — cross-module ERP building blocks
   - `src/modules/<name>/components` — domain-only components
7. Domain logic lives in modules (`hooks`, `services`, `types`), not inside UI primitives.

## Page composition pattern

Every module page should generally follow:

```text
Page
├── PageHeader          (title, description, actions)
├── Filters / Actions
├── Summary             (Cards / stats)
└── Main Content        (DataTable, Form, Charts, Tabs)
```

Dashboards should be composed from existing:

`Card`, `DataTable`, `Chart`, `Tag`/`StatusBadge`, `Tabs`, `Progress`, `Dropdown`, `Button`, `GrowShrinkValue`

Do **not** create one-off dashboard component libraries.

## Prompt style for agents

Prefer business requirements over UI invention:

```text
Create the Accounting Dashboard.

Requirements:
- Today's cash position
- Accounts receivable / payable
- Revenue & expenses
- Recent transactions
- Monthly revenue chart
- Expense breakdown
- Outstanding invoices

Use existing ECME components and the design system.
Do not create a new UI library.
Do not modify existing ECME components unless necessary.
```

## Module layout

```text
src/modules/<module>/
├── pages/          # Page compositions imported by app routes
├── components/     # Domain-only UI (e.g. AccountSelector)
├── hooks/
├── services/
└── types/
```

App routes stay thin:

```tsx
// src/app/(protected-pages)/accounting/page.tsx
export { default } from '@/modules/accounting/pages/Dashboard'
```

## Component catalog

See `docs/COMPONENT_CATALOG.md` for the reusable building blocks to prefer.
