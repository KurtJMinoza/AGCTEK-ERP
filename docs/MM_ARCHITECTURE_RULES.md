# MM Architecture Rules (Governance)

Phase 6 governance contract for Materials Management. **Agents and developers must read this before changing MM code.**

Related: [MM_FORBIDDEN_PATTERNS.md](./MM_FORBIDDEN_PATTERNS.md) · [MM_ARCHITECTURE.md](./MM_ARCHITECTURE.md) · `.cursor/skills/materials-management/SKILL.md`

---

## Allowed pattern (mandatory)

```text
Business service
  → authorized domain service (stock-ops, returns, warehouse completion, quality decision)
  → InventoryPostingService.postTransaction() | postTransferPair()
  → DB transaction (Serializable)
  → MmInventoryTransaction (immutable ledger)
  → MmInventoryBalance (derived state)
  → ValuationEngineService (when cost-relevant)
  → MmDomainEventsService → outbox → consumers
```

**Integration path:**

```text
Domain transaction
  → MmDomainEventsService.emit()
  → MmAccountingEvent / MmDomainEventOutbox
  → typed consumer (FICO, SD, Production, …)
  → receiving module reacts — never reverse (consumer → MM DB write)
```

---

## Domain ownership

| Layer | Owns | Must NOT own |
| --- | --- | --- |
| MM-08 Inventory | Physical quantity, ledger, ATP | PO approval, inspection rules |
| MM-05 MRP | Requirements, suggestions, planned orders | Inventory posting |
| MM-06 Procurement | PR, RFQ, PO, contracts | Balance changes |
| MM-07 Quality | Inspection, holds, usage decisions | Direct balance `quantity` writes |
| MM-09 Warehouse | Bins, tasks, pick/putaway execution | Parallel inventory engine |
| MM-12 Scanner/Mobile | Scan capture, task execution | Direct posting |

Full matrix: [MM_DOMAIN_BOUNDARIES.md](./MM_DOMAIN_BOUNDARIES.md)

---

## Automated enforcement

Architecture tests live in `backend/src/mm/architecture/`:

| Script | Command |
| --- | --- |
| Architecture only | `npm run test:architecture` (from `backend/`) |
| Full MM tests | `npm test` |

On failure, output includes:

```text
[RULE-ID] path/to/file.ts:line
  Forbidden: <pattern>
  Expected:  <correct architecture>
  Snippet:   <offending line>
```

Rule IDs map to [MM_FORBIDDEN_PATTERNS.md](./MM_FORBIDDEN_PATTERNS.md).

---

## Agent / PR checklist

Before merging MM changes:

1. Physical stock change? → `InventoryPostingService` only.
2. New reservation? → `reservation-balance.util` / `ReservationEngineService` (no ledger row).
3. Cross-module effect? → event via `MmDomainEventsService`, not foreign Prisma writes.
4. Retry-safe endpoint? → `idempotencyKey` on posting and scanner paths.
5. Frontend change? → display API values; no ATP math.
6. Run `npm run test:architecture` in `backend/`.

---

## Focused rule documents

| Document | Scope |
| --- | --- |
| [MM_QUALITY_RULES.md](./MM_QUALITY_RULES.md) | Inspection, holds, STATUS_CHANGE |
| [MM_MRP_RULES.md](./MM_MRP_RULES.md) | Planning-only boundary |
| [MM_INTEGRATION_RULES.md](./MM_INTEGRATION_RULES.md) | Events, outbox, external modules |
| [MM_FORBIDDEN_PATTERNS.md](./MM_FORBIDDEN_PATTERNS.md) | Full forbidden catalog + rule IDs |
