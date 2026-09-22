# MM Integration Rules

Cross-module boundaries for Materials Management. MM integrates through **typed APIs and events** — not foreign database writes.

Related: [MM_INTEGRATION_CONTRACTS.md](./MM_INTEGRATION_CONTRACTS.md) · [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md)

---

## Allowed integration pattern

```text
Command (owning module API)
  → Domain service (owning module)
  → PostgreSQL transaction
  → MmDomainEventsService.emit()
  → MmDomainEventOutbox / MmAccountingEvent
  → Idempotent consumer
```

MM exposes integration **facades** for inbound commands:

| Module | Facade | Path |
| --- | --- | --- |
| SD | `SdIntegrationService` | `integration/sd/` |
| Production | `ProductionIntegrationService` | `integration/production/` |
| FICO | Accounting event consumers | `integration/fico/` |
| Demand | `DemandIntegrationService` | `integration/demand/` |

---

## Forbidden

1. **External modules writing MM inventory tables** — no `prisma.mmInventoryBalance` / `mmInventoryTransaction` from `sd/`, `pp/`, `fico/`, `scm/`.
2. **Controller → foreign Prisma** — bypass domain services.
3. **Duplicate publishing** — same business event via both `MmDomainEventsService` and raw `EventEmitter2.emit` (legacy exceptions documented in MM_FORBIDDEN_PATTERNS).
4. **Second outbox** — use `MmOutboxService` / `MmDomainEventsService`, not ad-hoc event tables.
5. **Non-idempotent posting** — integration retries must use `idempotencyKey`.

---

## SD / Production inventory operations

External modules call MM integration APIs:

- `checkAvailability` / `reserveDemand` / `releaseBySource`
- `issueComponents` / `receiveOutput` (Production)
- Goods issue/receipt orchestrated inside MM stock-ops

They **do not** import `InventoryPostingService` directly.

---

## Event catalog

Canonical types: `backend/src/mm/common/mm-domain-events.types.ts`

Emit only through `MmDomainEventsService` (wraps outbox + legacy bridge where needed).

---

## Automated checks

| Rule ID | Check |
| --- | --- |
| MM-INT-EXTERNAL | No MM inventory Prisma writes from `sd/`, `pp/`, `fico/`, `scm/` |
| MM-INT-OUTBOX | No dual EventEmitter + MmDomainEventsService in new quality/receiving services |

Run: `npm run test:architecture` from `backend/`.

---

## Exception Center

Integration failures surface as read-only exceptions (`DEAD_LETTER_EVENT`, `FAILED_EVENT`, `CONSUMER_FAILURE`) — see [MM_EXCEPTION_CENTER.md](./MM_EXCEPTION_CENTER.md).
