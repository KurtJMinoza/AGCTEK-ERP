# MM MRP Architecture

Planning / MRP (MM-05) is a **read-and-recommend** domain. It must never post physical inventory.

Related: [MM_DEPENDENCY_MAP.md](./MM_DEPENDENCY_MAP.md) · [MM_DOMAIN_BOUNDARIES.md](./MM_DOMAIN_BOUNDARIES.md)

---

## Core rule

```text
MRP reads stock  →  computes net requirements  →  creates suggestions/planned orders
MRP NEVER calls InventoryPostingService
```

Enforced by specs:

- `backend/src/mm/planning/planning.spec.ts` — no `InventoryPostingService` import in MRP engine
- `backend/src/mm/planning/advanced-mrp-engine.spec.ts` — no `postTransaction` / `postMovement`

---

## Backend components

| Component | Path | Role |
| --- | --- | --- |
| `MrpEngineService` | `planning/mrp-engine.service.ts` | Netting, shortage detection, explainability |
| `MrpRunService` | `planning/mrp-run.service.ts` | Run lifecycle (QUEUED → RUNNING → COMPLETED) |
| `PlanningDemandService` | `planning/planning-demand.service.ts` | Demand CRUD |
| `ReorderRuleService` | `planning/reorder-rule.service.ts` | Safety stock, ROP, MOQ, lot size |
| `ProcurementSuggestionService` | `planning/procurement-suggestion.service.ts` | Suggestion persistence |
| `BOM_PROVIDER` | `planning/bom-provider.ts` | Production BOM explosion (pluggable; default `NullBomProvider`) |

Controller: `PlanningController` → `/api/v1/mm/planning/*`.

---

## Data model

| Model | Purpose |
| --- | --- |
| `MmPlanningDemand` | Independent demand (sales, production, maintenance, projects, manual, forecast) |
| `MmReorderRule` | Planning parameters per material/warehouse |
| `MmMrpRun` | Run header (horizon, scope, parameters JSON, status) |
| `MmMaterialRequirement` | Per material/warehouse snapshot for a run |
| `MmProcurementSuggestion` | BUY recommendations → PR |
| `MmPlannedOrder` | Planned production/replenishment orders |
| `MmSupplyProposal` | Supply-side proposals |
| `MmProjectedStock` | Time-phased projected availability buckets per MRP run (Phase 2A) |

---

## Phase 2A: Advanced planning foundation

Phase 2A enhances the existing MM-05 engine — it does **not** introduce a parallel MRP or inventory posting path.

### Time-phased projected stock

- Model: `MmProjectedStock` — one row per `(mrpRunId, warehouseId, materialId, bucketDate)`
- Pure function: `buildProjectedStockBuckets()` in `projected-stock.service.ts`
- Formula per day bucket: `closing = opening − demand + supply − reservationQty`
- Persisted during `MrpEngineService.executeRun()` for each material/warehouse with a planning signal
- Query: `GET /mm/planning/projected-stock?mrpRunId=` (defaults to latest COMPLETED run for company)

### Effective-dated planning parameters

`MmReorderRule` extended with:

- `plantId`, `planningHorizonDays`, `effectiveFrom`, `effectiveTo`
- `ReorderRuleService.resolveParams(companyId, materialId, warehouseId, material?, asOf?)` filters rules active on `asOf`
- Per-pair horizon override: `planningHorizonDays` on rule overrides run horizon for projected stock buckets

### ATP-aligned snapshots

`snapshotPair()` delegates opening availability to `InventoryAvailabilityService.getAvailability()`:

- `unrestrictedQty` ← `unrestrictedOnHand`
- `reservedQty` ← `reserved`
- `openingAvailable` ← `available` (used as day-0 projected stock opening)
- Quality/blocked quantities derived from ATP balance breakdown

MRP still never calls `InventoryPostingService`.

### Structured procurement explainability

`MmProcurementSuggestion` columns (in addition to prose `explanation`):

| Field | Source |
| --- | --- |
| `availableQuantity` | Requirement `availableQty` |
| `safetyStockQty` | Params / requirement `safetyStock` |
| `incomingSupplyQty` | Snapshot `incomingQty` |
| `grossDemandQty` | Requirement `grossDemand` |
| `planningRule` | `planningStrategy` from resolved params |

`buildSuggestionExplanation()` extended with available, safety stock, incoming supply, and planning rule.

### API aliases (Phase 2A)

| Method | Route | Action |
| --- | --- | --- |
| GET | `/demands` | Alias → planning demand list |
| POST | `/demands` | Alias → planning demand create |
| GET | `/projected-stock` | Time-phased buckets |

### Duplicate run policy

- Concurrent `RUNNING` execute blocked
- Re-execute `COMPLETED` run clears and rebuilds outputs (idempotent per run id)
- Optional `runKey` on create deduplicates QUEUED/RUNNING runs for same scope within 5 minutes

### Test matrix

`backend/src/mm/planning/mrp-planning-phase2a.spec.ts` — 17 scenarios (demand, supply, reservation, ER/PO, MOQ, lot size, lead time, effective dates, duplicate run, no posting).

---

## Phase 2B: Deterministic netting pipeline

Phase 2B refactors MRP into an explicit 15-step pipeline with batched scope loading and strategy-aware netting.

### Pipeline steps (`mrp-netting.pipeline.ts`)

1. Load planning scope (warehouses, materials)
2. Resolve active planning parameters (effective-dated)
3. Load demand within horizon (batched)
4. Load inventory ATP (`InventoryAvailabilityService.getAvailabilityBatch()`)
5. Load open supply (ER, PO, prior planned proposals)
6. Build time-phased projected stock buckets
7. Apply safety stock rules (TIME_PHASED: scan buckets)
8. Detect projected shortage (worst bucket violation)
9. Calculate net requirement
10. Apply lot size
11. Apply MOQ
12. Apply lead time via planning calendar
13. Plan planned order / supply proposal
14. Build structured explanation
15. Persist MRP result

### Strategy branching

| `planningStrategy` | Netting path |
| --- | --- |
| `TIME_PHASED` | Bucket-driven: recommend when `closingQty < safetyStock` |
| `REORDER_POINT`, `MIN_MAX` | Phase 2A aggregate `computeNetting()` (unchanged) |

### TIME_PHASED worked example

```text
Date     Demand  Supply  Projected closing
Sep 15   100     0       50
Sep 20   0       200     250
Sep 25   180     0       70

Safety stock = 100 → shortage 30 on Sep 25
Order date = Sep 25 − lead time (via planning calendar)
```

Fields: `MmMaterialRequirement.shortageDate`, `safetyStockViolationQty`; suggestion `projectedClosingQty`.

### Planning calendar port

- `PlanningCalendarPort` + `CalendarDayPlanningCalendar` (default: UTC calendar days)
- `PlanningCalendarService.resolve()` — future hook for org factory calendars
- Run `parametersJson`: `{ nettingEngine: '2B', calendarMode: 'CALENDAR_DAY' }`

### Batched scope loader

`MrpScopeLoaderService.loadScope()` — O(1) queries per entity type regardless of material×warehouse count:

- Demands, ER lines, PO lines, reservations, prior supply, rules, preferred suppliers, materials
- ATP via single balance query + in-memory grouping

### Determinism and PR dedup

- Pairs processed in sorted `(materialId, warehouseId)` order
- Auto-PR skips when PR line already exists for `(sourceMrpRunId, materialId, warehouseId)`
- Re-execute clears and rebuilds run outputs (idempotent per `mrpRunId`)

### Tests

`backend/src/mm/planning/mrp-netting-phase2b.spec.ts` — Sep 15/20/25 fixture, 2-warehouse independence, determinism, REORDER_POINT branch, scope-loader query-count performance guard.

---

## Phase 2C: Multi-level BOM integration

Phase 2C adds BOM explosion for independent demand without MM owning Production BOM master data.

### BOM provider port

Production owns BOM master. MM consumes via `BomProvider` (`planning/bom-provider.ts`):

| Method | Returns |
| --- | --- |
| `getBomHeader(req)` | BOM header (status, effective dates, yield) |
| `listComponents(req)` | Component lines (qty, UOM, scrap, validity) |

Default DI: `NullBomProvider` (no components). Production wires a real implementation later.

### Explosion pipeline (inserted after step 3)

1. Load independent `MmPlanningDemand` from scope
2. `BomExplosionService.explodeFromDemands()` — multi-level walk via provider
3. Validate: circular BOM, inactive BOM/lines, effective dates, missing materials, qty, UOM
4. Apply yield/scrap via `BomQuantityCalculator` (extensible, not in controllers)
5. Convert component UOM → material base UOM via `UomConversionsService`
6. Merge dependent demand into pair snapshots (`BOM_EXPLOSION` source)
7. Expand material scope to include BOM components
8. Continue Phase 2B netting unchanged

### Yield / scrap formula

```text
gross = (parentQty / yieldFactor) × quantityPer × (1 + scrapFactor)
```

Override via injectable `BomQuantityCalculator` (`DefaultBomQuantityCalculator` registered in `mm.module.ts`).

### Output / trace

Model: `MmBomExplosionTrace` — one row per explosion line per run.

Requirement split:

| Field | Meaning |
| --- | --- |
| `independentDemandQty` | Direct planning demand |
| `bomDependentDemandQty` | Gross component demand from BOM explosion |

Example trace reason:

```text
FG-001 demand = 100; RM-001 = 2/FG-001 → gross 200
```

Query: `GET /mm/planning/bom-explosion-traces?mrpRunId=`

Run `parametersJson`: `{ nettingEngine: '2D', explainability: true, bomExplosion: true, explosionLineCount, explosionWarningCount }`

### Guards

| Condition | Behavior |
| --- | --- |
| Circular BOM | Warning `CIRCULAR_BOM`, branch aborted |
| Inactive BOM / component | Skipped with warning |
| Outside effective date | Skipped |
| Missing material | Skipped with warning |
| Invalid qty | Skipped with warning |
| UOM conversion failure | Skipped with warning |

### Tests

`backend/src/mm/planning/mrp-bom-phase2c.spec.ts` — single/multi-level BOM, shortage, open PO, yield, scrap, inactive BOM, effective date, circular BOM, missing material, UOM conversion, NullBomProvider backward compat.

---

## Phase 2D: Structured explainability engine

Phase 2D adds a versioned structured `MrpRecommendationExplanation` JSON object persisted on material requirements and procurement suggestions. The prose `explanation` string on suggestions is **derived** from this JSON at run time — it is not the source of truth.

### Contract (`mrp-explanation.types.ts`)

| Field group | Contents |
| --- | --- |
| Identity | `version` (`2D`), `materialCode`, `materialName`, `warehouseCode`, `planningDate` |
| Demand lines | Independent rows from `MmPlanningDemand` (`sourceDocumentId` → label) plus BOM explosion lines (`FG-001 via BOM`) |
| ATP / netting | `openingStock`, `reserved`, `projectedSupply`, `safetyStock`, `projectedAvailable`, `grossDemand`, `netRequirement` |
| Recommendation | `moq`, `lotSize`, `recommendedQuantity`, `reasonCode`, `reasonSummary`, `planningRule` |
| References | `sourceDemandReferences[]`, optional `timePhased`, `leadTimeDays`, `expectedProcurementDate`, `preferredSupplierCode` |

### Builder (`mrp-explanation.builder.ts`)

Pure functions — not in controllers:

- `buildMrpExplanation(input)` — assembles JSON from pair snapshot, netting result, resolved params, demand lines, BOM traces
- `renderExplanationSummary(explanation)` — backward-compatible pipe-delimited prose
- `buildPipelineExplanation()` delegates to the builder (existing tests unchanged)

### Persistence

| Model | Field | Rule |
| --- | --- | --- |
| `MmMaterialRequirement` | `explanationJson` | Written once per run for every pair with a planning signal |
| `MmProcurementSuggestion` | `explanationJson` + `explanation` | Same JSON when `recommendedQty > 0`; `explanation` derived via `renderExplanationSummary()` |

Migration: `20260928120000_mrp_explanation_phase2d`

Run `parametersJson`: `{ nettingEngine: '2D', explainability: true, ... }`

### Scope loader extension

`PairSnapshot.independentDemandLines` — warehouse-scoped `MmPlanningDemand` rows with `sourceDocumentId` for per-line demand audit (e.g. `SO-1001 = 200`).

### Frontend

`MrpExplanationPanel` — renders demand lines, supply/demand math, reason, source references, optional BOM and time-phased subsections. Wired into Procurement Suggestions and Material Requirements pages via "View explanation" dialog.

### Tests

`backend/src/mm/planning/mrp-explanation-phase2d.spec.ts` — canonical RM-001 example, demand line labels, BOM lines, reason summaries, summary renderer.

---

## Netting inputs (MrpEngineService)

| Input | Source |
| --- | --- |
| `unrestrictedQty` | `InventoryAvailabilityService` → `unrestrictedOnHand` |
| `reservedQty` | `InventoryAvailabilityService` → `reserved` |
| `qualityQty` / `blockedQty` | Restricted status balances |
| `incomingQty` | Open POs / expected receipts (when `includeOpenReceipts`) |
| `plannedSupplyQty` | Planned orders / supply proposals |
| `productionSupplyQty` | BOM provider / production schedule |
| `demandQty` | Independent demand + BOM-dependent demand (merged) |
| `independentDemandQty` | `MmPlanningDemand` only |
| `bomDependentDemandQty` | `BomExplosionService` output |
| Planning params | `MmReorderRule` (safety stock, ROP, MOQ, lot size, lead time) |

---

## Netting outputs

| Output | Field / entity |
| --- | --- |
| Available | `availableQty` |
| Gross demand | `grossDemand` |
| Projected available | `projectedAvailable` |
| Net requirement | `netRequirement` |
| Recommended quantity | `recommendedQty` (lot-size rounded) |
| Shortage flag | `shortage`, `shortageQty` |
| Below ROP | `belowReorderPoint` |
| Action | `recommendedAction`: `CREATE_PR` \| `CREATE_PLANNED_PRODUCTION` \| `MONITOR` \| `NONE` |
| Dates | `requiredDate`, `expectedProcurementDate`, `projectedStockoutDate` |

---

## Explainability contract

Primary source of truth (Phase 2D): `explanationJson` on `MmMaterialRequirement` and `MmProcurementSuggestion` — immutable snapshot written at run completion.

Derived prose: `MmProcurementSuggestion.explanation` — generated by `renderExplanationSummary()` for backward compatibility and human-readable exports.

Builder: `buildMrpExplanation()` in `mrp-explanation.builder.ts` (replaces direct use of `buildSuggestionExplanation()` for persistence).

Scalar fields on suggestions (`availableQuantity`, `safetyStockQty`, `incomingSupplyQty`, `grossDemandQty`, `planningRule`, `reason`) remain for list views and reporting without parsing JSON.

---

## MRP run lifecycle

```text
Create MmMrpRun (QUEUED)
  → Load scope (company, plant, warehouse, horizon)
  → For each material/warehouse: snapshot balances, demand, supply
  → MrpEngineService.computeNetting(...)
  → Persist MmMaterialRequirement rows
  → Persist MmProjectedStock time-phased buckets
  → Create MmProcurementSuggestion / MmPlannedOrder / MmSupplyProposal
  → Optional: autoCreatePurchaseRequisitions (config flag on run)
  → Mark run COMPLETED (or FAILED with errorMessage)
  → Emit MRPCompleted / MRPShortageDetected (when wired)
```

---

## Outputs → downstream modules

| MRP output | Consumer | Action |
| --- | --- | --- |
| Procurement suggestion | MM-06 Procurement | User/system creates PR |
| Planned order | Production (future) | Converts to production order — no MM stock post until GI/GR |
| PR auto-create | MM-06 | Only when `autoCreatePurchaseRequisitions = true` on run |
| Shortage alert | Notifications / MM-15 | `StockBelowSafetyLevel` event |

---

## What MRP cannot do

- Post `RECEIPT` / `ISSUE` / any movement type
- Insert or update `MmInventoryTransaction`
- Mutate `MmInventoryBalance.quantity`
- Create "planned stock" balance rows
- Bypass procurement workflow for PO creation (unless explicit auto-PR config)

---

## Frontend (MM-05)

| Page | Module path |
| --- | --- |
| MRP Runs | `planning/pages/MrpRunsPage.tsx` |
| Projected Stock | `ProjectedStockPage.tsx` |
| Shortage Monitor | `ShortageMonitorPage.tsx` |
| Procurement Suggestions | `ProcurementSuggestionsPage.tsx` |
| Reorder Point / Safety Stock | `ReorderPointPage.tsx`, `SafetyStockPage.tsx` |

Display MRP results from API — never recompute netting in React.

---

## Configuration

Prefer `MmReorderRule` and run parameters over hardcoded thresholds:

- `planningStrategy`: `REORDER_POINT` \| `TIME_PHASED` \| `MIN_MAX`
- `procurementType`: `BUY` \| `MAKE` \| `BOTH`
- Run flags: `planningHorizonDays`, `includeOpenReceipts`, `autoCreatePurchaseRequisitions`

---

## Testing expectations

- MRP engine unit tests for netting edge cases (zero stock, full incoming PO, mixed demand)
- Architecture test: MRP source files exclude posting imports
- Integration: run → requirements → suggestions → manual PR creation
- Explainability: every suggestion has non-empty `reason` and traceable demand source
