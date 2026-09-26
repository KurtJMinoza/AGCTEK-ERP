# MM Quality Architecture

Quality is a first-class operational capability within MM-07 Receiving. It controls **stock usability**; MM-08 Inventory controls **physical quantity**.

Related: [MM_DOMAIN_BOUNDARIES.md](./MM_DOMAIN_BOUNDARIES.md) · [MM_TRANSACTION_RULES.md](./MM_TRANSACTION_RULES.md) · [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md)

---

## Separation of concerns

| Layer | Owns | Does NOT own |
| --- | --- | --- |
| Quality (MM-07) | Inspection planning, sampling, results, holds, NC/CAPA, usage decisions | Direct balance quantity writes |
| Inventory (MM-08) | Physical quantity, ledger, balances | Inspection characteristics, defect codes |

**Bridge:** Quality decisions that change usability post through `InventoryPostingService` (`QualityDecisionService` uses `TRANSFER_OUT` / `TRANSFER_IN` with target stock status).

---

## Data model (Prisma) — Phase 1A

| Model | Purpose |
| --- | --- |
| `MmInspectionPlan` | Plan template with scope (material, supplier, plant, effective dates) and sampling |
| `MmInspectionCharacteristic` | Plan lines — measurable attributes (numeric/boolean/text/categorical) |
| `MmDefectCode` | Master defect codes with default severity |
| `MmInspectionLot` | Inspection unit tied to GR line; enriched context (PO, supplier, batch, serial) |
| `MmInspectionSample` | Sample draws from lot |
| `MmInspectionResult` | Characteristic measurements per sample |
| `MmInspectionDefect` | Defect records linked to master code |
| `MmNonconformance` | NC register from failed inspection / defects |
| `MmCorrectiveAction` | CAPA linked to NC |
| `MmQualityHold` | Blocks usage until released (hold type + optional target stock status) |
| `MmQualityDecision` | Usage decision audit trail with idempotency key |
| `MmQualityAttachment` | Evidence files for lots, NC, etc. |
| `MmQualityWorkflowRule` | Optional approval gate configuration |
| `MmQualityInspectionRule` | **Phase 1B** — configurable inspection requirement rules (priority-based) |
| `MmQualityInspection` | **Legacy** model (inbound/) — read/decide only for historical data |

### Lot status machine

`CREATED` / `READY` → `IN_PROGRESS` → `PENDING_DECISION` → `DECIDED` / `CLOSED` (or `CANCELLED`)

Legacy alias: API accepts `PENDING` as `CREATED`; `COMPLETED` maps to `DECIDED`.

---

## Backend services

| Service | Path | Role |
| --- | --- | --- |
| `QualityRuleService` | `quality/` | Resolves inspection requirement from `MmQualityInspectionRule` |
| `InspectionRequirementService` | `receiving/` | Thin delegator → `QualityRuleService` (no rule logic) |
| `InspectionLotService` | `receiving/` | Creates/manages lots from GR (no new legacy QI) |
| `QualityHoldService` | `receiving/` | Hold/release workflow with hold types |
| `QualityDecisionService` | `receiving/` | Usage decision → inventory transfer posting |
| `InspectionPlanService` | `quality/` | Plan CRUD + selection by material/supplier/plant |
| `DefectCodeService` | `quality/` | Master defect code CRUD |
| `SamplingService` | `quality/` | Fixed / percent / full sample sizing |
| `InspectionLotLifecycleService` | `quality/` | start / complete / cancel transitions |
| `NonconformanceService` | `quality/` | NC lifecycle |
| `CorrectiveActionService` | `quality/` | CAPA on NC |
| `QualityAttachmentService` | `quality/` | File evidence storage |
| `QualityWorkflowService` | `quality/` | Optional approval via `WorkflowService` |
| `QualityReportingService` | `quality/` | Dashboard + usage decision list |
| `QualityInspectionService` | `inbound/` | Legacy inspection flow (historical only) |

**Canonical API:** `QualityController` at `/api/v1/mm/quality/*`

**Legacy aliases:** `InspectionLotController`, `QualityHoldController` delegate to the same services.

---

## Inspection rule engine (Phase 1B)

Receiving calls **`QualityRuleService.resolveInspectionRequirement(...)`** — no hardcoded OR logic in receiving services.

### Rule dimensions (nullable = wildcard)

Material, material category, supplier, supplier category, plant, warehouse, purchase type (`PO` / `CONTRACT` / `NON_PO`), receipt type (`PO` / `ASN` / `DIRECT`).

### Actions

| Action | Effect |
| --- | --- |
| `NO_INSPECTION` | Skip QI stock and lot creation |
| `INSPECTION_REQUIRED` | QI stock; plan sampling applies |
| `FULL_INSPECTION` | QI stock; force full sampling |
| `SAMPLE_INSPECTION` | QI stock; plan sampling or default percent |

### Resolution (deterministic)

1. Active rules within effective date window
2. All non-null dimensions must match receiving context
3. Sort by **priority DESC**, then **ruleCode ASC**
4. First match wins; no match → `NO_INSPECTION`

Legacy master-data flags (`qualityInspectionRequired` on material/supplier/warehouse, `inspectionRequired` on supplier-material) are **deprecated at runtime**. A one-time migration seeds them into editable rules (`SEED-*` codes).

**Admin UI:** `/modules/mm/receiving/inspection-rules`  
**API:** `GET/POST/PUT/DELETE /api/v1/mm/quality/inspection-rules`

---

## Standard inbound quality flow

```text
PO / ASN
  → Expected Receipt / Receiving (MM-07)
  → Goods Receipt document (stock-ops)
  → InventoryPostingService (RECEIPT, stockStatus = QUALITY_INSPECTION)
  → InspectionLot created (plan selected, samples generated)
  → start → record results / defects → complete
  → QualityHold (optional)
  → Usage Decision:
       ACCEPT / ACCEPT_WITH_DEVIATION → UNRESTRICTED
       BLOCK / REJECT               → BLOCKED / QUARANTINE + NC
       REWORK                        → BLOCKED
       RETURN                        → QUARANTINE + supplier return draft
  → PutawayRequested event → MM-09 putaway (when unrestricted)
```

GR reverse cancels open lots via `InspectionLotLifecycleService.cancelOpenLotsForGr`.

---

## Usage decision codes

| Decision | Target stock status | Follow-up |
| --- | --- | --- |
| `ACCEPT` | `UNRESTRICTED` | Putaway |
| `ACCEPT_WITH_DEVIATION` | `UNRESTRICTED` | Putaway + deviation record |
| `BLOCK` | `BLOCKED` | NC auto-created |
| `REJECT` | Alias of `BLOCK` (deprecated) | NC + supplier incident event |
| `REWORK` | `BLOCKED` | Rework process |
| `RETURN` | `QUARANTINE` | Supplier return initiation |

Partial quantity decisions tracked via cumulative `decidedQuantity` on lot. Idempotency via `(lotId, idempotencyKey)`.

---

## Events

| Event | Emitter |
| --- | --- |
| `InspectionLotCreated` | `InspectionLotService` |
| `QualityDecisionMade` | `QualityDecisionService` |
| `QualityAccepted` | `QualityDecisionService` (ACCEPT paths) |
| `QualityRejected` | `QualityDecisionService` (BLOCK/REJECT) |
| `SupplierQualityIncident` | `QualityDecisionService` (supplier-linked failures) |
| `PutawayRequested` | After accept / unrestricted release |
| `SupplierReturnRequested` | On return decisions |

See [MM_INTEGRATION_EVENTS.md](./MM_INTEGRATION_EVENTS.md).

---

## Frontend (MM-07)

| Page | Route |
| --- | --- |
| Quality Dashboard | `/modules/mm/receiving/quality-dashboard` |
| Inspection Queue | `/modules/mm/receiving/inspection-queue` |
| Inspection Detail | `/modules/mm/receiving/inspection-queue/[id]` |
| Inspection Plans | `/modules/mm/receiving/inspection-plans` |
| Inspection Rules | `/modules/mm/receiving/inspection-rules` |
| Defect Codes | `/modules/mm/receiving/defect-codes` |
| Nonconformances | `/modules/mm/receiving/nonconformances` |
| Usage Decisions | `/modules/mm/receiving/usage-decisions` |
| Quality Holds | `/modules/mm/receiving/quality-holds` |
| Quality Quarantine | `/modules/mm/receiving/quality-quarantine` (legacy data only) |

Services: `qualityService.ts` (canonical `/mm/quality/*`), `inspectionService.ts` and `qualityHoldService.ts` (legacy aliases).

UI must not compute stock status locally — display backend balance status from inventory APIs.

---

## ATP impact

Only `UNRESTRICTED` stock counts toward available quantity (minus reservations).

`QUALITY_INSPECTION`, `BLOCKED`, `QUARANTINE`, `IN_TRANSIT`, `EXPIRED`, `DAMAGED` are restricted — visible in ATP response as `restrictedStock`, not available.

---

## Testing expectations

Suites: `backend/src/mm/quality/receiving-quality-phase1a.spec.ts`, `backend/src/mm/quality/quality-inspection-rule.spec.ts`

Architecture guard: `backend/src/mm/architecture/mm-posting-integration.spec.ts` — quality services must not write `mmInventoryBalance` directly.

- Decision → transfer pair posts with idempotency key
- BLOCK path triggers NC + supplier incident events
- Inspection lot quantity ≤ GR line quantity
- GR reverse cancels open lots
- Plan selection by material/supplier/plant scope

All physical dispositions (scrap, return ship, restock) still post through MM-08.

---

## Phase 1C: Quality Analytics and Corrective Action

### Quality metrics (read-only)

`QualityMetricsService` (`quality/quality-metrics.service.ts`) computes six metric blocks from transactional tables. It is **read-only** — no `@MmMutation`, no inventory/posting calls.

| Metric | Source tables | Key computation |
| --- | --- | --- |
| **DefectTrend** | `MmInspectionDefect`, `MmDefectCode` | Weekly buckets by defect code, top-10 defects |
| **SupplierQualityMetric** | `MmInspectionLot`, `MmQualityDecision`, `MmNonconformance` | Per supplier: lots, accept/reject rates, defect qty, open NC |
| **MaterialQualityMetric** | Same, grouped by `materialId` | Per material: same KPI set |
| **QualityHoldAging** | `MmQualityHold` | Active hold buckets (0-7d, 8-30d, 31-90d, 90d+), avg duration |
| **InspectionTurnaround** | `MmInspectionLot` | `createdAt` → `inspectedAt`/`decidedAt`: avg, median, P90, by priority |
| **NonconformanceMetric** | `MmNonconformance`, `MmCorrectiveAction` | Counts by status/severity, avg resolution days, open CAPA count |

### Analytics integration (MM-14)

`AnalyticsService.getQuality()` composes all six metrics alongside existing `receivingAccuracy` and `qualityInspection`. Response includes `readOnly: true`.

### Supplier performance bridge (MM-13)

`SupplierEvaluationService.gatherMetrics()` reads `MmInspectionLot` with decisions instead of legacy `gr.qualityInspections`. Uses `QualityMetricsService.buildQualityLinesFromInspectionLots()` to produce `QualityLine[]` for the score engine.

Supplier performance **never auto-blocks** suppliers — alerts are advisory only.

### CAPA lifecycle

`MmCorrectiveAction` expanded with full 8D fields:

| Field | Purpose |
| --- | --- |
| `problem` | Problem description (migrated from legacy `description`) |
| `rootCause` | Root cause analysis |
| `containment` | Immediate containment action |
| `correctiveAction` | Corrective action taken |
| `preventiveAction` | Preventive measures |
| `resolution` | Closure summary |
| `verifiedAt` / `verifiedBy` | Verification audit |
| `closedAt` / `closedBy` | Closure audit |

**Status machine:**

```text
OPEN → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED
  |         |            |
  +----→ CLOSED    CLOSED    (skip-to-close allowed)
                     |
               IN_PROGRESS    (re-open from COMPLETED)
```

**OVERDUE** is derived (API-only, not persisted) when `dueDate < now` and status ∈ {OPEN, IN_PROGRESS}.

### API endpoints

```text
GET    /mm/quality/corrective-actions          (list, company-scoped)
GET    /mm/quality/corrective-actions/:id       (detail with NC + lot context)
PUT    /mm/quality/corrective-actions/:id       (update fields, not CLOSED)
POST   /mm/quality/corrective-actions/:id/transition  (status transition)
GET    /mm/quality/nonconformances/:id/corrective-actions  (list for NC)
POST   /mm/quality/nonconformances/:id/corrective-actions  (create under NC)
```

### Frontend

| Page | Route |
| --- | --- |
| Quality Analytics (MM-14) | `/modules/mm/reports-analytics/quality-analytics` |
| Nonconformances (CAPA UI) | `/modules/mm/receiving/nonconformances` |

### Testing

Suites: `corrective-action.spec.ts` (17 tests), `analytics.spec.ts` (8 tests), `supplier-performance.spec.ts` (16 tests)

Migration: `20260924120000_quality_analytics_capa_phase1c`
