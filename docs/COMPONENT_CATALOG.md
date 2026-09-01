# Component catalog (prefer these)

Inspect these folders before creating UI:

- `src/components/ui` — ECME primitives
- `src/components/shared` — compositions used across modules
- `src/components/layouts` + `src/components/template` — app shell (reuse, don't rebuild)

## ECME primitives (`src/components/ui`)

| Need | Use |
| --- | --- |
| Actions | `Button`, `Dropdown` |
| Surfaces | `Card` |
| Forms | `Form`, `FormItem`, `FormContainer`, `Input`, `InputGroup`, `Select`, `Checkbox`, `Radio`, `Switcher`, `DatePicker`, `TimeInput`, `Upload` |
| Feedback | `Alert`, `Dialog`, `Drawer`, `Notification`, `toast`, `Spinner`, `Skeleton`, `Progress` |
| Data display | `Table`, `Pagination`, `Tabs`, `Tag`, `Badge`, `Avatar`, `Timeline`, `Steps`, `Tooltip` |
| Charts helpers | Prefer `shared/Chart` over raw chart wrappers |

Import via:

```ts
import { Button, Card, Input, Dialog, Select } from '@/components/ui'
```

## Shared compositions (`src/components/shared`)

| Need | Use |
| --- | --- |
| Page chrome | `PageHeader`, shared `PageContainer` (content only), `Container`, `AdaptiveCard`; shell containment via route `meta` + `template/PageContainer` |
| Tables | `DataTable` |
| Forms sections | `FormSection`, `ConfirmDialog` |
| Status | `StatusBadge`, `Tag` (via ui), `GrowShrinkValue` |
| Numbers | `NumericInput`, `AbbreviateNumber`, `CustomFormatInput` |
| Charts / calendar | `Chart`, `CalendarView` |
| Misc | `Loading`, `StickyFooter`, `UsersAvatarGroup`, `EllipsisButton` |

## Domain components

Put ERP-specific selectors and widgets in modules, e.g.:

- `src/modules/accounting/components/AccountSelector.tsx`
- `src/modules/hr/components/EmployeeSelector.tsx`
- `src/modules/procurement/components/VendorSelector.tsx`

These should wrap ECME `Select` / `Dialog` / `Input` — not reinvent them.
