# MM Demand Integration — Phase 3E

Generic demand contract between external ERP modules and Materials Management (MRP). MM does **not** own external documents; it consumes normalized demand lines and may reference the source on reservations.

Related: [MM_INTEGRATION_CONTRACTS.md](./MM_INTEGRATION_CONTRACTS.md) · [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md)

---

## Architecture

```text
External module (SD | Production | Maintenance | Projects)
  → MmDemandProvider (live read) OR POST /mm/integration/demand/sync (push)
  → MmDemandRegistryService.listOpenDemand()
  → MmDemandAggregationService.loadForMrp()
  → MrpScopeLoaderService → MRP engine

Reservations: MmInventoryReservationHeader.sourceModule / sourceDocumentType / sourceDocumentId
              + line demandReferenceLineId
```

**Single MRP path** — no per-module MRP implementations. All demand flows through `MmDemandAggregationService`.

---

## Normalized demand line (`MmNormalizedDemandLine`)

| Field | Description |
| --- | --- |
| `sourceModule` | `SD`, `PRODUCTION`, `MAINTENANCE`, `PROJECTS`, `MM` |
| `sourceDocumentType` | e.g. `SALES_ORDER`, `PRODUCTION_ORDER`, `WORK_ORDER`, `PROJECT` |
| `sourceDocumentId` | External document id (MM does not own it) |
| `sourceDocumentLineId` | Line/component id when applicable |
| `materialId` | MM material master |
| `warehouseId` / `plantId` | Supply location |
| `requiredDate` | Date demand is needed |
| `quantity` | Open quantity in UOM |
| `uomId` | Unit of measure |
| `priority` | 1 (highest) … 999 (lowest) |
| `status` | `OPEN`, `CANCELLED`, `FULFILLED` |
| `demandReferenceKey` | Idempotency key: `module:type:doc[:line]` |

Legacy MRP label: `sourceType` (`SALES`, `PRODUCTION`, `MAINTENANCE`, `PROJECTS`, `MANUAL_INTERNAL`).

---

## Provider port (`MmDemandProvider`)

```typescript
interface MmDemandProvider {
  readonly moduleId: string
  listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]>
}
```

Registered providers (`backend/src/mm/integration/demand/providers/`):

| Module | Provider | Data source |
| --- | --- | --- |
| SD | `SdDemandProvider` | Live `SdSalesOrder` confirmed lines |
| Production | `ProductionDemandProvider` | Live `PpProductionOrder` released materials |
| Maintenance | `MaintenanceDemandProvider` | Synced `mm_planning_demands` rows |
| Projects | `ProjectsDemandProvider` | Synced `mm_planning_demands` rows |

---

## Integration API

Base: **`/api/v1/mm/integration/demand`**

| Endpoint | Operation |
| --- | --- |
| `GET /providers` | List registered demand modules |
| `GET /open` | Query aggregated open demand (all providers) |
| `POST /sync` | Upsert one demand line (Maintenance, Projects, MM only) |
| `POST /sync/batch` | Upsert multiple lines |
| `POST /cancel-by-source` | Cancel all open lines for a source document |

SD and Production publish demand through domain events and live providers — direct sync is rejected.

---

## Event-driven sync

| Event | Action |
| --- | --- |
| `SalesOrderConfirmed` | Reserve + upsert SD demand lines |
| `SalesOrderCancelled` | Release reservations + cancel demand |
| `SalesDemandChanged` | Adjust reservations + upsert changed qty |
| `ProductionMaterialRequirementCreated` | Reserve + upsert PP demand |
| `ProductionOrderCancelled` | Release + cancel demand |
| `ProductionMaterialRequirementChanged` | Adjust reservations + upsert changed qty |

Listeners: `sd-demand.listener.ts`, `production-demand.listener.ts`

---

## Persistence

`MmPlanningDemand` (`mm_planning_demands`) stores:

- Synced external demand (with `demandReferenceKey`)
- Manual MM-entered demand (`demandReferenceKey` null, `sourceModule=MM`)

MRP aggregation merges **provider feeds** + **manual rows without reference key**. Provider-owned lines are not double-counted.

---

## Reservations

Reservation headers reference the demand source:

- `sourceModule`, `sourceDocumentType`, `sourceDocumentId`
- Line-level `demandReferenceLineId` links to external line id

---

## Adding a new demand source

1. Add module id to `MM_DEMAND_MODULES` in `mm-demand.types.ts`.
2. Implement `MmDemandProvider` **or** sync via `/sync` if MM only stores references.
3. Register provider in `demand-integration.module.ts`.
4. Emit domain events for lifecycle (create/change/cancel) if the module owns documents.
5. Do **not** add MRP-specific code in `mrp-engine.service.ts` — extend the provider registry only.

Tests: `backend/src/mm/integration/demand/mm-demand-integration.spec.ts`
