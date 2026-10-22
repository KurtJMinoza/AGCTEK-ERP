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
| Filter toolbars | `FilterBar` (compact field row + applied chips; MM list pages) |
| Forms sections | `FormSection`, `FormDialog`, `ConfirmDialog` |
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

## MM Inventory shared UI (`src/modules/mm/inventory/utils`)

The Inventory Management sub-modules share one visual language. Reuse these
instead of rebuilding them per page:

| Need | Use |
| --- | --- |
| Shared atoms (tones, status chips, "safe to retry", radar blip) | `inventoryUi.tsx` |
| Ledger / movement table columns | `ledgerColumns.tsx` (`buildTransactionColumns`) |
| Document list columns (Issue / Receipt / Adjustment / Transfer) | `stockDocColumns.tsx` (`buildStockDocColumns`) |
| Summary tiles for document lists | `summaryTiles.tsx` (`StatusSummaryTiles`) |
| Human labels for movement / source / reason / actor codes | `ledgerLabels.ts` |

