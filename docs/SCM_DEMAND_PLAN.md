# SCM Demand Plan

One SCM card: **Demand Plan** (`/scm/demand-planning`). A plan is a **version** of demand by
product (or family) × location × period × qty. The **planning horizon is a scope parameter**
of the plan — not a module, nav item, or domain object.

Out of scope for this card: fleet / trips / GPS / geofence / load building, network & capacity
design, statistical forecasting engine, FICO.

## Data model

| Model | Role |
| --- | --- |
| `DemandPlanVersion` | Header: `code`, `status`, `horizonKind`, `bucket`, `viewLength`, `freezeFencePeriods`, `granularity`, `notes` |
| `DemandForecast` | Base-grain line: SKU × location × **week** (`periodStart` = Monday UTC). `quantity` = system, `adjustedQty` = planner override, `consensusQty` = S&OP, `historicalQty` = actuals |
| `DemandPlanAdjustment` | Immutable audit of every override (previous → new, reason, actor) |

Effective qty = `consensusQty ?? adjustedQty ?? quantity`.

Migration: `backend/prisma/migrations/20261004120000_scm_demand_plan_versions` (additive only).

## Horizon presets

| Horizon | Bucket | Default length | Granularity | Freeze fence | Editable |
| --- | --- | --- | --- | --- | --- |
| OPERATIONAL | WEEK | 12 | SKU | 2 periods | Yes (DRAFT, outside fence) |
| TACTICAL | MONTH | 18 | FAMILY | 1 period | View only (rollup) |
| STRATEGIC | QUARTER | 8 | FAMILY | 0 | Aggregate, read-only |

The freeze fence rolls with "now": periods starting before `current period + freezeFencePeriods`
are frozen (lock icon, read-only). `viewLength` / `freezeFencePeriods` are editable per version
while DRAFT.

## Server-side aggregation (guardrail)

Switching horizon calls `GET /scm/demand/plans/:id/grid?horizonKind=…`. The server rolls the
weekly SKU lines up with SQL (`date_trunc('week'|'month'|'quarter')`, grouped by SKU or family and
location) and returns only the pivoted, already-aggregated cells for the visible window. The
browser never receives or aggregates raw SKU/week data for coarser views.

Approximation: a week belongs to the month/quarter containing its Monday.

Overrides are only accepted at base grain (Operational, SKU × week). Rolled-up views show
"Adjust at Operational (SKU × week) grain."

## Past Sales → Generate forecast

The Forecast tab view switcher is **[ Chart | Grid | Past Sales ]**. All three share the header's version, location and horizon.

| Field (per weekly line) | Source |
| --- | --- |
| `historicalQty` | Past Sales (`DemandSalesActual`) for that week |
| `quantity` (= systemForecastQty) | Generated baseline |
| `adjustedQty` (+ `adjustmentReason`) | Planner override (grid cell edit, audited) |
| final | computed on read as `consensusQty ?? adjustedQty ?? quantity` |

`DemandSalesActual` holds weekly actuals keyed by the same `productCode` / `locationCode` as the plan lines.
It's loaded by seed/import today. SD billing is the future feed, via events.

**Generate pipeline** (`POST /plans/:id/generate-forecast`):
1. Reject unless the plan is **DRAFT** (409) or the horizon is **Strategic** (400).
2. Load Past Sales for the plan's products at the scoped location over `historyLength` periods before the current period.
3. **Convert to the plan bucket in SQL**: `SUM` over `date_trunc(bucket)`. Weeks are summed into months, never averaged.
4. Compute a **moving average** with N = 4 or 12 over the last N bucket totals. Periods before an item's first sale are ignored; later gaps count as zero.
5. Write the same baseline to every **non-frozen** period of the horizon. Monthly totals are split across the weeks whose Monday falls in the month, in whole units that sum exactly to the monthly baseline. Frozen periods and weeks are never written.
6. Overrides (`adjustedQty` / `consensusQty`) are **kept** by default. Only `overwriteAdjustments: true` clears them, and each cleared override writes a `DemandPlanAdjustment` audit row.
7. Refresh `historicalQty` from Past Sales, and stamp `lastGeneratedAt`, `lastGeneratedBy` and `generationParams` on the version.
8. Return `{ generation, detail, grid }`. `grid` has the same shape as `GET …/grid` for the same scope, so the UI applies it with no second GET.

Cell overrides (`PATCH …/cells`) only touch `adjustedQty`. They never change the system forecast.

## Chart | Grid (Forecast tab)

The Forecast tab has a **Chart | Grid** toggle (Chart is the default) and KPI chips above both views.
The chart, the KPIs and the grid all come from the **same** `GET …/grid` response.
The server builds a `chart` block in `demand-plan.chart.ts` from the rows the database already aggregated:

| Field | Meaning |
| --- | --- |
| `series[]` | `{key, label, productKey, family, values[], compareValues[], adjusted[], total, varianceAbs, variancePct}`. Locations are summed. |
| `densityMode` | `FULL` · `FAMILY` (SKUs rolled to family, `?chartDensity=FAMILY`) · `TOP5_OTHER` |
| `freezePeriodIndexes` | Drives the shaded freeze band on the chart |
| `kpis` | `forecastTotal`, `historyTotal` (run-rate), `compareTotal`, `varianceAbs/Pct` + `varianceBasis`, `overrideCells` |

- **Density:** if there are more than 10 series, the server plots the Top 5 by |variance| plus one "Other" series. The UI shows a note when this happens.
- **Variance basis:** the comparison version when one is selected. Otherwise it's the history run-rate, and failing that the system forecast.
- **History run-rate:** actuals ÷ weeks of actuals × window weeks. Partial history is never compared to the window as a raw total.
- **Chevrons:** ▲ and ▼ always appear with the number, e.g. `+308 units (+23.8%) ▲`. This applies in KPIs, tooltips, the legend and grid deltas (`utils/demandDelta.ts`).
- **Sync:** a grid save goes to `PATCH …/cells`, which writes the audit rows. The page then refetches `…/grid` for the active scope, so the chart and KPIs re-render without a page reload.

## Status workflow

```text
DRAFT ⇄ REVIEWED ⇄ APPROVED → PUBLISHED (terminal)
```

- Only `APPROVED → PUBLISHED` (via `POST …/publish`); PUBLISHED can't be edited or reverted.
- Cell edits only in DRAFT; each needs a reason and writes `DemandPlanAdjustment`.
- Transitions use conditional updates (`where status = expected`) for concurrency safety.
- Downstream consumers (ATP / MPS / MRP) should read the **latest PUBLISHED** version (not yet wired).

## API (`/api/v1/scm/demand`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/horizon-presets` | Preset table above |
| GET | `/plans?status=&horizonKind=&page=&pageSize=` | List versions |
| GET | `/plans/:id` | Version + freeze info + last 50 adjustments |
| POST | `/plans` | Create DRAFT `{horizonKind, code?, copyFromVersionId?, notes?}` (copies latest PUBLISHED by default) |
| PATCH | `/plans/:id` | `{status?, viewLength?, freezeFencePeriods?, notes?}` |
| GET | `/plans/:id/grid?horizonKind=&bucket=&viewLength=&granularity=&locationCode=&compareVersionId=&chartDensity=AUTO\|FAMILY` | Server-aggregated grid + `chart` block |
| PATCH | `/plans/:id/cells` | `{cells:[{lineId, adjustedQty|null, reason}]}` (≤500, DRAFT, outside fence) |
| POST | `/plans/:id/publish` | APPROVED → PUBLISHED |
| GET | `/past-sales?versionId=&locationCode=&bucket=WEEK\|MONTH\|QUARTER&historyLength=` (or `from`/`to`) | Actuals pivoted server-side to the bucket |
| POST | `/plans/:id/generate-forecast` | `{method:'MOVING_AVERAGE', window:4\|12, historyLength?, overwriteAdjustments?=false, horizonKind?, locationCode?, compareVersionId?, chartDensity?}` → `{generation, detail, grid}` |

Actor for audit: `X-User-Id` header (sent by `ErpAxiosBase`).

Location codes on lines and past sales match `Warehouse.code` (MM warehouse master). The grid and past-sales responses include `locationNames` (code → warehouse name, read-only lookup); the UI shows the name and falls back to the code when no warehouse matches.

## Seed

```bash
cd backend
npm run prisma:seed-demand-plan   # standalone, idempotent
# also runs as part of: npm run prisma:seed
```

Creates 5 SKUs across 4 families × 2 locations (MAIN, SECONDARY), weeks −12…+103, and two versions:
`DP-2026-09` (PUBLISHED) and `DP-2026-10` (DRAFT, with 2 overrides + audit rows).

## What happened to Forecasts / Planning Horizons

- The orphan **Forecasts** UI (`pages/Forecasts.tsx`, `DemandForecastPanel`, `useForecasts`) and
  `/scm/forecasts` API were removed; `DemandForecast` was extended with `versionId` and is now the
  line table of the Demand Plan grid.
- **Planning Horizons** (`/scm/planning-settings`, `PlanningHorizons.tsx`) was removed as a
  module; its settings became horizon presets + per-version `viewLength` / `freezeFencePeriods`.
  `/scm/planning-horizons` now redirects to `/scm/demand-planning`.
- The legacy `ScmPlanningSettings` table remains in the schema (unused) — drop in a later migration.
- The MM safety-stock chart lives on the MM Safety Stock page only.
