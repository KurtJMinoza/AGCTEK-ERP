# MM Integration Contracts

Typed integration boundaries between Materials Management and other ERP domains. MM must not write directly to foreign module tables.

Related: [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md) · [MM_ARCHITECTURE.md](./MM_ARCHITECTURE.md) · [MM_DOMAIN_BOUNDARIES.md](./MM_DOMAIN_BOUNDARIES.md) · [MM_EXCEPTION_CENTER.md](./MM_EXCEPTION_CENTER.md)

---

## Integration pattern (mandatory)

```text
Command (API or internal)
  → Domain Service (owning module)
  → PostgreSQL Transaction
  → MmDomainEventsService.emit(...)
  → EventEmitter2 (in-process)
  → MmAccountingEvent (financial outbox, status PENDING)
  → Downstream consumer (FICO, SD, Production, Notifications, …)
```

**Forbidden:** Controller → foreign module Prisma write without domain service on owning side.

Infrastructure:

| Component | Path |
| --- | --- |
| Event catalog registry | `backend/src/mm/common/mm-event-catalog.registry.ts` |
| Integration envelope | `backend/src/mm/common/mm-integration-event.types.ts` |
| Envelope builder | `backend/src/mm/common/mm-integration-event.builder.ts` |
| Domain emitter | `backend/src/mm/common/mm-domain-events.service.ts` |
| Transactional outbox | `backend/src/mm/common/mm-outbox.service.ts` |
| Idempotent consumers | `backend/src/mm/common/mm-event-consumer.service.ts` |
| Event constants | `backend/src/mm/common/mm-domain-events.types.ts` |

---

## Phase 3A — formal typed registry

The registry defines **every** MM integration event with:

- category (Master Data, Procurement, Receiving, Quality, Inventory, …)
- `currentVersion` / `supportedVersions` (`v1`, `v2`)
- `financial` flag → auto-mirror to `MmAccountingEvent`
- `intendedConsumers` (FICO, SD, Production, Notifications, Analytics, …)

Emit API:

```typescript
// Preferred — atomic with business transaction
const envelope = await domainEvents.emitInTransaction(tx, {
  eventType: MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED,
  companyId, sourceModule, sourceEntityType, sourceEntityId,
  payload, correlationId, causationId, documentReferences,
})
// after commit:
domainEvents.dispatchAfterCommit(envelope)

// Standalone (legacy path — outbox + dispatch, not in same tx as business write)
await domainEvents.emitIntegration({ ... })
```

Consumer API:

```typescript
await consumerService.handleIdempotent({
  consumerId: 'FICO_ACCOUNTING',
  envelope,
  handler: async () => { /* post GL bridge */ },
})
```

Tests: `backend/src/mm/common/mm-integration-contracts.spec.ts`

---

## Payload contract (minimum)

All integration events use:

```typescript
{
  eventType: string          // canonical, PascalCase — see MM_INTEGRATION_EVENTS.md
  companyId: string
  sourceModule: string       // e.g. STOCK_OPS, INVENTORY, INBOUND
  documentType: string       // e.g. GOODS_RECEIPT, RESERVATION
  documentId: string
  occurredAt: string         // ISO-8601
  payload: Record<string, unknown>
}
```

**Consumer dedupe key:** `(eventType, documentType, documentId)`.

**Versioning:** extend `payload` with new optional fields; never rename/remove required fields without migration.

---

## MM → FICO (Finance) — Phase 3D

See [MM_FICO_INTEGRATION.md](./MM_FICO_INTEGRATION.md) for full Phase 3D flow.

| MM event | Trigger | Payload must include | FICO action (consumer) |
| --- | --- | --- | --- |
| `GoodsReceiptPosted` | GR post complete | v2 context: plant, material type, valuation class, movement type, currency, value, lines | `INVENTORY_INCREASE` + `GRIR_ACCRUAL` hints |
| `GoodsIssuePosted` | GI post complete | `issuePurpose`, lines with account-determination context | `INVENTORY_DECREASE` + `COGS_EXPENSE` hints |
| `InventoryAdjusted` | Adjustment post | reason code, lines, posting date | `INVENTORY_ADJUSTMENT` hint |
| `InventoryTransferred` | Inter-warehouse post | from/to warehouse, `financiallyRelevant`, valued lines | `TRANSFER_CLEARING` hint |
| `SupplierReturnPosted` | Supplier return post | return id, lines | `GRIR_REVERSAL` hint |
| `ScrapPosted` / `DisposalPosted` | Disposal post | disposal type, lines | `INVENTORY_LOSS` hint |
| `LandedCostAllocated` | Landed cost allocate | material, allocated amount | `LANDED_COST` hint |
| `PriceVariancePosted` | Valuation / match variance | variance amount, material | `PRICE_VARIANCE` hint |
| `InventoryRevaluationPosted` | Standard cost change | old/new cost, on-hand qty | `INVENTORY_REVALUATION` hint |
| Reversal events (`*Reversed`) | Document reversal | original document ref, lines | `REVERSAL` hint |

**Period control:** MM calls `canPostToPeriod(companyId, postingDate)` via `FINANCIAL_PERIOD_PORT` before posting. FICO owns `fico_financial_periods`.

**Idempotency:** `sourceEventId`, `sourceTransactionId`, `idempotencyKey` on `MmAccountingEvent`; FICO journal keyed on `idempotencyKey`.

**Reconciliation:** `GET /api/v1/mm/integration/fico/reconciliation` — MM valuation vs FICO posted totals.

Persistence: `MmAccountingEvent` with `status: PENDING | CONSUMED | FAILED`. Legacy alias: `accounting.entry.requested`.

MM **never** posts GL entries or hardcodes account numbers.

---

## MM ↔ SD (Sales & Distribution)

See [MM_SD_INTEGRATION.md](./MM_SD_INTEGRATION.md) for full Phase 3B flow.

### Formal MM integration API (SD-facing)

Base: **`/api/v1/mm/integration/sd`**

| Endpoint | Operation |
| --- | --- |
| `POST /availability/check` | Single-material ATP |
| `POST /availability/check-batch` | Multi-line ATP for SO confirm |
| `POST /availability/check-date` | ATP with required date metadata |
| `POST /reservations` | Idempotent reserve from SD demand |
| `POST /reservations/by-source/:id/release` | Release all reservations for SO |
| `POST /reservations/by-source/:id/adjust` | Partial release on qty decrease |
| `GET /reservations/by-source/:id/status` | Reservation/allocation snapshot |

Implementation: `backend/src/mm/integration/sd/`

### Events

| Direction | Events |
| --- | --- |
| SD → MM | `SalesOrderConfirmed`, `SalesOrderCancelled`, `SalesDemandChanged` |
| MM → SD | `ReservationCreated`, `ReservationReleased`, `ShortageDetected`, `AllocationCreated`, `AllocationReleased`, `GoodsIssuePosted` |

Reservation headers use `sourceModule=SD`, `sourceDocumentType=SALES_ORDER`, `sourceDocumentId=<salesOrderId>`, and line-level `demandReferenceLineId`.

SD must not compute ATP locally or write MM inventory tables directly.

---

## MM ↔ Production

See [MM_PP_INTEGRATION.md](./MM_PP_INTEGRATION.md) for full Phase 3C flow.

### Formal MM integration API (Production-facing)

Base: **`/api/v1/mm/integration/production`**

| Endpoint | Operation |
| --- | --- |
| `POST /availability/check` | Single-material ATP |
| `POST /availability/check-batch` | Multi-component ATP before release |
| `POST /reservations` | Idempotent reserve from production order |
| `POST /reservations/by-source/:id/release` | Release all reservations on cancel |
| `POST /reservations/by-source/:id/adjust` | Partial release on component qty decrease |
| `GET /reservations/by-source/:id/status` | Reservation/allocation snapshot |
| `POST /components/issue` | Allocate + goods issue for components |
| `POST /output/receive` | Post finished-goods receipt |

### BOM (read-only from MM)

| Contract | Notes |
| --- | --- |
| `BomProvider` | Production owns `PpBillOfMaterial`; MM reads via `ProductionBomProvider` — **no duplicate BOM in MM** |
| MRP | BOM explosion via `BOM_PROVIDER` injection |

### Events

| Direction | Events |
| --- | --- |
| Production → MM | `ProductionOrderReleased`, `ProductionMaterialRequirementCreated`, `ProductionOrderCancelled`, `ProductionMaterialRequirementChanged` |
| MM → Production | `ReservationCreated`, `ReservationReleased`, `ShortageDetected`, `AllocationCreated`, `GoodsIssuePosted`, `GoodsReceiptPosted` |

Reservation headers use `sourceModule=PRODUCTION`, `sourceDocumentType=PRODUCTION_ORDER`.

### MRP planned orders

| Contract | Notes |
| --- | --- |
| `MmPlannedOrder` / `MmSupplyProposal` | Planned production orders — **no inventory post** until PP execution posts GI/GR |

---

## Generic demand contract — Phase 3E

See [MM_DEMAND_INTEGRATION.md](./MM_DEMAND_INTEGRATION.md) for full Phase 3E flow.

| Contract | Path | Purpose |
| --- | --- | --- |
| `MmDemandProvider` | `backend/src/mm/integration/demand/mm-demand-provider.port.ts` | Normalized open demand from any module |
| `MmDemandRegistryService` | `demand/mm-demand-registry.service.ts` | Aggregates all providers — single query surface |
| `MmDemandAggregationService` | `demand/mm-demand-aggregation.service.ts` | **Only MRP demand loader** (providers + manual rows) |
| `MmDemandSyncService` | `demand/mm-demand-sync.service.ts` | Idempotent upsert into `mm_planning_demands` |

Base API: **`/api/v1/mm/integration/demand`**

| Module | Integration mode |
| --- | --- |
| SD | Live `SdDemandProvider` + event sync on SO confirm/cancel/change |
| Production | Live `ProductionDemandProvider` + event sync on requirement create/change/cancel |
| Maintenance | Push via `POST /sync` → `MaintenanceDemandProvider` reads synced rows |
| Projects | Push via `POST /sync` → `ProjectsDemandProvider` reads synced rows |
| MM manual | `PlanningDemandService.create` with `demandReferenceKey` null |

**Rules:**

- MM does not own SD/PP/Maintenance/Projects documents — only references them.
- MRP never calls foreign modules directly; it uses `MmDemandAggregationService.loadForMrp()`.
- Do **not** add per-module MRP loaders — register a new `MmDemandProvider` instead.
- Reservations link via `sourceModule`, `sourceDocumentType`, `sourceDocumentId`, `demandReferenceLineId`.

---

## MM → Projects / Maintenance

Maintenance and Projects publish demand through the Phase 3E sync API (`sourceModule=MAINTENANCE|PROJECTS`). MRP consumes them via the generic provider registry, not ad-hoc queries.

Issues reference project/WBS via `sourceDocumentType` on GI lines when integrated.

---

## MM → SCM / Logistics

| Contract | Notes |
| --- | --- |
| ASN / expected receipt | MM-07 consumes logistics ASN → `MmExpectedReceipt` |
| In-transit stock | `IN_TRANSIT` stock status + transfer documents (`stock-transfer/`) |
| Transport events | SCM tracks shipment; MM owns stock status at GR/GI post |

Do not duplicate transportation models inside MM inventory tables.

---

## MM → Notifications

| Trigger | Mechanism |
| --- | --- |
| Workflow approval tasks | `WorkflowService` → `NotificationsService` |
| `StockBelowSafetyLevel` | Planning/reorder → notification consumer |
| `PurchaseOrderOverdue` | Dashboard alerts / PO service |
| Supplier performance alerts | `SupplierAlertService` (advisory only) |

---

## MM → Analytics (MM-14 / MM-15)

| Rule | Detail |
| --- | --- |
| Read-only | `AnalyticsService`, `ReportsService`, `DashboardKpiService` |
| No write-back | Analytics must not mutate operational MM tables |
| Cache | Dashboard KPI TTL cache acceptable; invalidate on material events if needed |

Facade routes: `/mm/analytics/{inventory|procurement|warehouse|quality|valuation}`, `/mm/dashboard/mm`.

---

## Inbound integration API expectations

External systems (WMS, supplier portal, EDI) must:

1. Call MM domain APIs (`/api/v1/mm/...`), not raw balance tables.
2. Supply `idempotencyKey` on all stock-affecting operations.
3. Include `companyId`, `warehouseId`, document references.
4. Accept async FICO posting via event consumers.

---

## Adding a new integration

1. Add entry to `MM_EVENT_CATALOG` in `mm-event-catalog.registry.ts` and constant to `MM_DOMAIN_EVENTS`.
2. Emit via `emitInTransaction()` (preferred) or `emitIntegration()` — never bypass outbox.
3. Document in [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md).
4. Add consumer using `MmEventConsumerService.handleIdempotent()` + test in `mm-integration-contracts.spec.ts`.
5. If `financial: true` in catalog → auto-mirror to `MmAccountingEvent` (no manual create).
6. Do **not** create a second outbox table.
