# MM Integration Events

Canonical domain events for cross-module integration (FICO, SD, Production, notifications, reporting, audit).

For integration **contracts** (payload requirements, consumer responsibilities), see [MM_INTEGRATION_CONTRACTS.md](./MM_INTEGRATION_CONTRACTS.md).

Events are emitted in-process via `EventEmitter2`, persisted to `MmDomainEventOutbox` (Phase 3A transactional outbox), and mirrored to `MmAccountingEvent` when financially relevant.

**Source of truth (code):** `backend/src/mm/common/mm-event-catalog.registry.ts`

## Phase 3A envelope

Every integration event uses:

```typescript
{
  eventId: string
  eventType: string           // PascalCase — catalog key
  eventVersion: 'v1' | 'v2'
  occurredAt: string          // ISO-8601
  companyId: string
  plantId?: string | null
  sourceModule: string
  sourceEntityType: string
  sourceEntityId: string
  correlationId: string       // business process trace root
  causationId?: string | null // prior event in chain
  actorId?: string | null
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
  documentReferences?: { entityType: string; entityId: string }[]
}
```

In-process channels:

| Channel | Payload |
| --- | --- |
| `<EventType>` | Legacy `MmDomainEventPayload` (backward compatible) |
| `mm.domain.event` | Legacy envelope |
| `mm.integration.event` | Full Phase 3A envelope |

## Event catalog (registry)

| Canonical event | Emitter | Payload highlights | Consumers |
| --- | --- | --- | --- |
| `GoodsReceiptPosted` | `goods-receipt.service` | `goodsReceiptId`, company, lines | FICO (GR/IR), MM-09 putaway |
| `GoodsIssuePosted` | `goods-issue.service` | `goodsIssueId`, issuePurpose, lines | FICO (COGS), SD |
| `InventoryAdjusted` | `adjustment.service` | document id, lines, reason | FICO, MM-14 reports |
| `InventoryTransferred` | `inter-warehouse-posting.ts` | transfer id, from/to warehouse | FICO, MM-09 |
| `ReservationCreated` | `reservation.service` | reservation id, qty, source doc | MM-09 picking, notifications |
| `ReservationReleased` | `reservation.service` | reservation id (cancel/fulfill) | Availability refresh |
| `QualityDecisionMade` | `QualityDecisionService` | inspection lot id, decision code, qty | MM-09 putaway, blocked stock |
| `QualityAccepted` | `QualityDecisionService` | lot id, supplier id, qty | MM-13 supplier performance |
| `QualityRejected` | `QualityDecisionService` | lot id, decision code | MM-13, notifications |
| `SupplierQualityIncident` | `QualityDecisionService` | supplier id, material id | MM-13 analytics |
| `SupplierReturnPosted` | `supplier-return.service` | return id, lines | FICO, MM-02 supplier perf |
| `InventoryTransactionPosted` | `inventory-posting.service` | transaction id, movement | Audit, traceability |
| `InventoryTransactionReversed` | `inventory-posting.service` | reversal + original ids | Audit, FICO reversal |
| `StockBelowSafetyLevel` | `planning/` (reorder) | material, warehouse, qty | Notifications, MM-06 PR |
| `PurchaseOrderOverdue` | `purchase-order.service` / alerts | po id, due date | Notifications, MM-13 |

## SD ↔ MM events (Phase 3B)

See [MM_SD_INTEGRATION.md](./MM_SD_INTEGRATION.md).

### SD produces → MM consumes

| Event | Emitter | MM handler |
| --- | --- | --- |
| `SalesOrderConfirmed` | `SdEventEmitterService` | `SdDemandListener` → ATP + reserve + demand sync |
| `SalesOrderCancelled` | `SdEventEmitterService` | `SdDemandListener` → release + cancel demand |
| `SalesDemandChanged` | `SdEventEmitterService` | `SdDemandListener` → adjust reservation + demand sync |

Consumer id: `MM_SD_DEMAND`

### MM produces → SD consumes

| Event | Emitter | SD handler |
| --- | --- | --- |
| `ReservationCreated` | `ReservationEngineService` | `SdMmEventConsumer` → line state |
| `ReservationReleased` | `ReservationEngineService` | `SdMmEventConsumer` → clear/reduce reserved qty |
| `ShortageDetected` | `ReservationEngineService` | `SdMmEventConsumer` → `integrationStatus=SHORT` |
| `AllocationCreated` | `AllocationEngineService` | Warehouse visibility |
| `AllocationReleased` | `AllocationEngineService` | Warehouse visibility |
| `GoodsIssuePosted` | `GoodsIssueService` | `SdMmEventConsumer` → `issuedQuantity`, `FULFILLED` |

Consumer id: `SD_FULFILLMENT`

## Production ↔ MM events (Phase 3C)

See [MM_PP_INTEGRATION.md](./MM_PP_INTEGRATION.md).

### Production produces → MM consumes

| Event | Emitter | MM handler |
| --- | --- | --- |
| `ProductionOrderReleased` | `PpEventEmitterService` | `ProductionDemandListener` → ATP batch check |
| `ProductionMaterialRequirementCreated` | `PpEventEmitterService` | `ProductionDemandListener` → reserve + demand sync |
| `ProductionOrderCancelled` | `PpEventEmitterService` | `ProductionDemandListener` → release + cancel demand |
| `ProductionMaterialRequirementChanged` | `PpEventEmitterService` | `ProductionDemandListener` → adjust reservation + demand sync |

Consumer id: `MM_PP_DEMAND`

### MM produces → Production consumes

| Event | Emitter | Production handler |
| --- | --- | --- |
| `ReservationCreated` | `ReservationEngineService` | `PpMmEventConsumer` → component line state |
| `ReservationReleased` | `ReservationEngineService` | `PpMmEventConsumer` → clear/reduce reserved qty |
| `ShortageDetected` | `ReservationEngineService` | `PpMmEventConsumer` → `integrationStatus=SHORT` |
| `AllocationCreated` | `AllocationEngineService` | Warehouse visibility |
| `GoodsIssuePosted` | `GoodsIssueService` | `PpMmEventConsumer` → `issuedQuantity` on components |
| `GoodsReceiptPosted` | `GoodsReceiptService` | `PpMmEventConsumer` → output linked, order completed |

Consumer id: `PP_FULFILLMENT`

## Generic demand integration (Phase 3E)

See [MM_DEMAND_INTEGRATION.md](./MM_DEMAND_INTEGRATION.md).

| Mechanism | Detail |
| --- | --- |
| `MmDemandProvider` | SD and Production expose live demand; Maintenance/Projects read synced rows |
| `MmDemandAggregationService` | Single MRP loader — no per-module MRP code |
| `POST /mm/integration/demand/sync` | Maintenance, Projects, MM push normalized lines |
| `demandReferenceKey` | Idempotency: `module:type:doc[:line]` on `MmPlanningDemand` |

Maintenance/Projects modules without a live provider must sync demand via the integration API; MRP consumes through the registry.

## Legacy aliases (still emitted)

| Legacy string | Maps to |
| --- | --- |
| `goods-receipt.posted` | `GoodsReceiptPosted` |
| `goods-issue.posted` | `GoodsIssuePosted` |
| `inventory.transaction.posted` | `InventoryTransactionPosted` |
| `inventory.transaction.reversed` | `InventoryTransactionReversed` |
| `inventory.stock.changed` | Internal MM-08 (not integration) |
| `accounting.entry.requested` | FICO bridge — enriched v2 payload + idempotency (`MmAccountingEvent` → `FicoJournalEntry`) |

## Payload contract (minimum)

Legacy listeners continue to receive:

```typescript
{
  eventType: string
  companyId: string
  sourceModule: string
  documentType: string      // maps to sourceEntityType
  documentId: string        // maps to sourceEntityId
  occurredAt: string
  payload: Record<string, unknown>
}
```

New integrations should subscribe to `mm.integration.event` and use the Phase 3A envelope.

## Versioning

- Catalog entries declare `currentVersion` and `supportedVersions` (`v1`, `v2`).
- Extend `payload` with optional fields when evolving; never remove required fields without migration.
- `resolveEventVersion()` in the registry picks the effective version.

## Persistence (outbox)

| Table | Purpose |
| --- | --- |
| `mm_domain_event_outbox` | All integration events — `PENDING → DISPATCHED / FAILED / DEAD_LETTER` |
| `mm_accounting_events` | Financial subset for FICO bridge (`status: PENDING \| CONSUMED \| FAILED`) — includes `idempotencyKey`, `accountingEffects`, account-determination context |
| `fico_financial_periods` | FICO-owned fiscal period state (`OPEN` \| `CLOSED`) |
| `fico_journal_entries` | FICO journal stub keyed on `idempotencyKey` |

**Atomic rule:** use `MmDomainEventsService.emitInTransaction(tx, input)` so business writes and outbox rows commit together. Call `dispatchAfterCommit(envelope)` after the transaction succeeds.

Use `MmDomainEventsService` / `MmOutboxService` — do not create parallel outbox tables.

## Idempotency

| Layer | Dedupe key |
| --- | --- |
| Outbox publish | `(eventType, sourceEntityType, sourceEntityId, eventVersion)` — unique on `dedupeKey` |
| Consumer | `MmEventConsumerReceipt (consumerId, dedupeKey)` via `MmEventConsumerService.handleIdempotent()` |
| FICO accounting | `idempotencyKey` on `MmAccountingEvent` + `FicoJournalEntry` |
| Physical stock | `idempotencyKey` on `MmInventoryTransaction` |

## Correlation example

```text
PurchaseOrderApproved  correlationId=proc-100
  → GoodsReceiptPosted   correlationId=proc-100, causationId=<PO eventId>
    → InventoryTransactionPosted
      → InventoryValuationUpdated
        → MmAccountingEvent (FICO)
```

Document references carry lightweight IDs only (PO, receiving, GR, transaction) — never full document bodies.
