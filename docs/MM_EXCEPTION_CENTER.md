# MM Exception Center — Phase 5

Centralized **read-only** operational exception aggregation for Materials Management. The Exception Center does **not** create or mutate transactions; it queries existing domain tables and surfaces actionable items with drill-down links to the owning module.

Related: [MM_ARCHITECTURE.md](./MM_ARCHITECTURE.md) · [MM_INTEGRATION_CONTRACTS.md](./MM_INTEGRATION_CONTRACTS.md)

---

## Architecture

```text
Domain tables (PO, variance, hold, task, MRP run, outbox, …)
  → ExceptionCenterService collectors (parallel read queries)
  → normalize MmExceptionItem + severity + href
  → GET /api/v1/mm/exceptions[|/counts|/:id]
  → Exception Center UI (filters + severity cards + DataTable)
  → user clicks href → owning domain detail page
```

**Not a transaction engine.** Fix actions always navigate away from the dashboard.

---

## API

Base path: `/api/v1/mm/exceptions`

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Paginated exception list |
| GET | `/counts` | Severity/domain totals |
| GET | `/:id` | Single exception by composite id |

### Query filters

| Param | Description |
| --- | --- |
| `companyId` | Required company scope |
| `plantId` | Optional plant filter |
| `warehouseId` | Optional warehouse filter |
| `severity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `domain` | See domains below |
| `status` | Source document status |
| `dateFrom` / `dateTo` | Filter on `detectedAt` |
| `includeStale` | Include items older than 90 days (default: exclude) |
| `page` / `limit` | Pagination |
| `role` / `authority` | Visibility gating (dev-friendly defaults when omitted) |

### Exception id format

```text
{domain}:{type}:{sourceId}
```

Example: `procurement:OVERDUE_PO:po-uuid`

---

## Domains and types

| Domain | Types (source tables) |
| --- | --- |
| **procurement** | `OVERDUE_PO`, `PENDING_APPROVAL`, `SUPPLIER_BLOCKED`, `PRICE_VARIANCE` |
| **receiving** | `OVER_RECEIPT`, `UNDER_RECEIPT`, `UNEXPECTED_ITEM`, `DAMAGED_RECEIPT`, `RECEIVING_VARIANCE` |
| **quality** | `QUALITY_HOLD`, `FAILED_INSPECTION`, `UNRESOLVED_NC`, `OVERDUE_CAPA` |
| **inventory** | `LOW_STOCK`, `BLOCKED_STOCK`, `RESERVATION_SHORTAGE`, `ALLOCATION_SHORTAGE` |
| **warehouse** | `TASK_EXCEPTION`, `OVERDUE_TASK`, `WRONG_BIN`, `PICK_SHORT` |
| **inventory_control** | `COUNT_VARIANCE`, `RECOUNT_REQUIRED`, `ADJUSTMENT_PENDING` |
| **transfers** | `TRANSFER_OVERDUE`, `TRANSIT_AGING`, `TRANSFER_SHORTAGE` |
| **mrp** | `MRP_SHORTAGE`, `LATE_SUPPLY`, `NO_APPROVED_SUPPLIER`, `MOQ_ISSUE`, `LEAD_TIME_ISSUE` |
| **integration** | `DEAD_LETTER_EVENT`, `FAILED_EVENT`, `CONSUMER_FAILURE` |

> **Note:** `NEGATIVE_STOCK_ATTEMPT` is not surfaced — rejected postings are blocked at `InventoryPostingService` and are not persisted as queryable exceptions today.

---

## Stale handling

Exceptions with `detectedAt` older than **90 days** are marked `stale: true` and excluded from list/counts unless `includeStale=true`. This keeps the dashboard focused on actionable work while preserving audit visibility when needed.

---

## Permissions and scope

Visibility reuses `resolveVisibility()` from the MM dashboard:

- Procurement domain → `mm.procurement`
- Receiving, quality, warehouse, transfers → `mm.warehouse`
- Inventory, inventory control, MRP → `mm.inventory`
- Integration → `mm.analytics`

All items are filtered to the requested `companyId`. `getOne` rejects cross-company access.

---

## UI

Route: `/modules/mm/exception-center`

- Severity summary cards (Critical / High / Medium / Low)
- Filters: company, plant, warehouse, severity, domain, date range, include stale
- Table columns: severity, type, domain, title, document, age, owner, recommended action
- Action links open the owning module (PO detail, quality hold, MRP requirement, etc.)
- Integration exceptions link back with `?domain=integration` until a dedicated integration monitor page exists

---

## Tests

`backend/src/mm/exception-center/exception-center.spec.ts` covers:

1. Aggregation and count consistency
2. Domain/severity filters
3. Warehouse scope on collectors
4. Drill-down `getOne` with href
5. Permission visibility by authority
6. Cross-company denial
7. Stale exclusion vs inclusion
8. Procurement-only visibility when scoped

---

## Backend module

```text
backend/src/mm/exception-center/
├── exception-center.types.ts
├── exception-center.util.ts
├── exception-center.service.ts
├── exception-center.controller.ts
├── exception-center.module.ts
├── dto/exception-center.dto.ts
└── exception-center.spec.ts
```

Wired via `ExceptionCenterModule` in `mm.module.ts`.
