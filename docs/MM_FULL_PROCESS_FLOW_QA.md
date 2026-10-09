# Materials Management — Full Process Flow (QA / Bug Hunt)

Use this document to walk **every major MM process** in order, verify outcomes, and catch integration bugs. It complements [MODULE_FLOWS_DETAILED.md](./MODULE_FLOWS_DETAILED.md) §4 with **UI routes**, **checklists**, and **automated test hooks**.

**Entry:** ERP → **Materials Management** (`/modules/mm/dashboard`)  
**Health dashboard:** [Exception Center](/modules/mm/exception-center) — should stay empty (or only expected warnings) after each phase.

---

## 0. Before you start

| Item | Action |
| --- | --- |
| Auth | Log in as a user with MM scope (company + plant + warehouse). |
| Clean slate (optional) | `cd backend && npm run prisma:seed-mm-purge` — **wipes MM/WH data**, not SCM/FICO/users. |
| Demo data | Auto MM seed is **off**; you must create masters in the UI ([MM_DEMO_WALKTHROUGH.md](./MM_DEMO_WALKTHROUGH.md)). |
| Backend tests | `cd backend && npm test -- --testPathPatterns=mm --runInBand --forceExit` |
| Architecture gate | `cd backend && npm run test:architecture` |

### Golden rules (bug magnets if violated)

1. **All physical stock changes** go through `InventoryPostingService` only — never expect UI-only qty changes to persist.
2. **ATP** comes from `InventoryAvailabilityService` APIs — do not compare SD/POS numbers to a manual spreadsheet of on-hand minus reserved.
3. **MRP never posts inventory** — shortages become PR/suggestions only.
4. **Reservations reduce ATP, not on-hand** until goods issue / dispatch posting.
5. **Company / plant / warehouse scope** must match on every document chain (P2P, transfer, count).

---

## Phase 1 — Organization (foundation)

**Purpose:** Scope every later transaction.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 1.1 | `/modules/mm/organization/companies` | Create **Company** (legal entity). | Company appears in lists; API calls require `companyId`. |
| 1.2 | `/modules/mm/organization/plants` | Create **Plant** under company. | Plant linked to company. |
| 1.3 | `/modules/mm/organization/branches` | Create **Branch** (optional selling location tag). | Branch saved; used on SD orders where applicable. |

**Bug checks**

- [ ] Switching company in header/filter shows empty data (not another company’s rows).
- [ ] Creating plant without company → clear validation error (not 500).

---

## Phase 2 — Material Master (MM-01)

**Purpose:** Identity for procurement, inventory, SD product links, barcodes.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 2.1 | `/modules/mm/material-master/material-types` | Define material types (if empty). | Types selectable on material form. |
| 2.2 | `/modules/mm/material-master/material-categories` | Define categories. | Category on material matches MM taxonomy. |
| 2.3 | `/modules/mm/material-master/units-of-measure` | Base UOM (e.g. PCS, KG). | UOM available on material. |
| 2.4 | `/modules/mm/material-master/uom-conversions` | Optional conversion (e.g. BOX → PCS). | Conversion used correctly on PO/receipt if tested. |
| 2.5 | `/modules/mm/material-master/materials-skus` | Create **Material / SKU** (tracking: none / batch / serial as needed). | Material `ACTIVE`; code unique per company. |
| 2.6 | `/modules/mm/material-master/barcodes` | Link barcode to material. | Scanner/mobile flows resolve material. |
| 2.7 | `/modules/mm/material-master/batches` | (If batch-managed) create batch master. | Batch required on receipt/issue where enforced. |
| 2.8 | `/modules/mm/material-master/serial-numbers` | (If serial-managed) register serials. | Serial uniqueness enforced. |

**Bug checks**

- [ ] Material detail saves without 500; reload shows same tracking flags.
- [ ] Deactivate / block material → procurement and ATP behavior matches policy (error or warning, not silent success).
- [ ] SD **Product Catalog** link to MM material still loads stock preview (no 500 on batch preview API).

**Automated tests:** `materials-mm01.spec.ts`, `material-usability.spec.ts`, `materials.service.spec.ts` *(see § Automated test status)*.

---

## Phase 3 — Supplier Management

**Purpose:** Approved sources for P2P and MRP suggestions.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 3.1 | `/modules/mm/supplier-management/supplier-master` | Create supplier (`ACTIVE`, correct company). | Supplier list + detail OK. |
| 3.2 | `/modules/mm/supplier-management/supplier-categories` | Categorize (optional). | Filter works. |
| 3.3 | `/modules/mm/supplier-management/supplier-materials` | Link **supplier ↔ material** (lead time, MOQ). | Material purchasable from supplier. |
| 3.4 | `/modules/mm/supplier-management/supplier-pricing` | Price record for material. | PO line can default price. |
| 3.5 | `/modules/mm/supplier-management/payment-terms` | Payment terms. | Terms on PO. |
| 3.6 | `/modules/mm/supplier-management/supplier-documents` | Required docs (expiry dates). | **Expired required doc blocks PO** (by design). |
| 3.7 | `/modules/mm/supplier-management/supplier-evaluation` / `supplier-performance` | Scores (optional). | Reports show data if entered. |

**Bug checks**

- [ ] `BLOCKED` or wrong-company supplier cannot create PO (user-visible error).
- [ ] Competitive sourcing: award with &lt;2 quotes fails when policy requires 2+ (`procurement-p2p-hardening`).

**Automated tests:** `supplier.spec.ts`, `supplier-pricing.service.spec.ts`, `supplier-performance.spec.ts`.

---

## Phase 4 — Warehouse structure (MM-03)

**Purpose:** Bins, putaway, picking, transfers.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 4.1 | `/modules/mm/warehouse-management/warehouses` | Warehouse on plant. | WH scoped to plant/company. |
| 4.2 | `/modules/mm/warehouse-management/storage-types` | Storage types (bulk, pick face, QI). | Types on sections/bins. |
| 4.3 | `/modules/mm/warehouse-management/storage-sections` | Sections (area = storage type). | Hierarchy complete. |
| 4.4 | `/modules/mm/warehouse-management/storage-shelves` | Shelves within sections (optional). | Shelf code unique per section. |
| 4.5 | `/modules/mm/warehouse-management/storage-bins` | Bins with codes (optional `shelfId`). | Bin scannable in mobile flows. |
| 4.6 | `/modules/mm/warehouse-management/bin-capacity` | Capacity (optional). | Over-capacity warnings if implemented. |

**Bug checks**

- [ ] `/modules/mm/warehouse-management/overview` loads without error.
- [ ] Task queue empty until receipts/transfers create work.

**Automated tests:** `mm03-warehouse.spec.ts`, `warehouse-task-engine.spec.ts`, `warehouse-ops.spec.ts`, `storage-shelves.service.spec.ts` *(DI drift — § Test status)*.

---

## Phase 5 — Procure to pay (P2P) — **core flow**

**Purpose:** Bring stock into the ledger legally and traceably.

```text
PR → approval → RFQ → quotations → comparison/award → PO → approval
  → ASN/ER → Receiving → GR posting → (QI?) → unrestricted stock in receipt bin
  → supplier invoice → three-way match
```

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 5.1 | `/modules/mm/procurement/purchase-requisitions` | Create PR for material/qty. | PR `DRAFT`/`SUBMITTED`. |
| 5.2 | Workflow / approvals | Approve PR (if required). | Status `APPROVED`. |
| 5.3 | `/modules/mm/procurement/rfqs` | RFQ from PR (or manual). | Suppliers invited. |
| 5.4 | `/modules/mm/procurement/supplier-quotations` | Enter supplier quotes. | ≥2 quotes if competitive policy. |
| 5.5 | `/modules/mm/procurement/quotation-comparison` | Compare & award. | Award recorded. |
| 5.6 | `/modules/mm/procurement/purchase-orders` | Create PO (manual or from PR). | PO lines match material/UOM/qty. |
| 5.7 | `/modules/mm/procurement/po-approvals` | Approve PO. | PO releasable. |
| 5.8 | `/modules/mm/receiving/expected-receipts` or `advanced-shipping-notices` | ER/ASN for PO. | Open qty for receiving. |
| 5.9 | `/modules/mm/receiving/goods-receipt` or `receiving-inspection` | Receive against PO/ER. | GR document; **on-hand increases** in ledger. |
| 5.10 | Quality (if triggered) | `/modules/mm/receiving/inspection-queue` → results → `/modules/mm/receiving/usage-decisions` | PASS → unrestricted; FAIL → hold/NC path. |
| 5.11 | `/modules/mm/inventory-management/stock-overview` | Verify qty in receipt/storage bin (no putaway step). | Bin stock visible. |
| 5.12 | `/modules/mm/inventory-management/stock-overview` | Verify qty. | Matches GR − issues. |
| 5.13 | `/modules/mm/inventory-management/inventory-ledger` | Trace transaction. | Immutable txn row for GR. |
| 5.14 | `/modules/mm/procurement/supplier-invoices` | Enter invoice. | Invoice recorded. |
| 5.15 | `/modules/mm/procurement/three-way-match` | Match PO + GR + invoice. | `MATCH` or explicit exception. |

**Bug checks**

- [ ] Over-receipt blocked or flagged (`receiving-variances`, Exception Center **receiving** domain).
- [ ] GR cancel/reversal: balances return to pre-GR state (document-flow chain intact).
- [ ] Partial GR: open PO qty correct on second receipt.
- [ ] Idempotent resubmit of same GR idempotency key does not double post.

**Automated tests:** `purchase-requisition.spec.ts`, `rfq.spec.ts`, `purchase-order.spec.ts`, `inbound.spec.ts`, `receiving-quality-hardening.spec.ts`, `three-way-match.spec.ts`, `document-flow.spec.ts` (P2P chain).

---

## Phase 6 — Inventory operations (reservation → issue)

**Purpose:** Commit and consume stock for SD/PP/manual issues.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 6.1 | `/modules/mm/inventory-management/available-stock` | Check ATP vs on-hand. | Reserved qty reduces ATP only. |
| 6.2 | `/modules/mm/inventory-management/reservations` | Create reservation (or via SD order). | Reservation `ACTIVE`; ATP down. |
| 6.3 | Allocation engine | (Often automatic on pick) | Allocated qty tied to bins/batches. |
| 6.4 | `/modules/mm/inventory-management/goods-issue` | Issue against reservation/delivery. | On-hand ↓; ledger GI txn. |
| 6.5 | `/modules/mm/inventory-management/stock-movements` | Audit list. | Movements match 6.2–6.4. |
| 6.6 | `/modules/mm/inventory-management/inventory-adjustments` | Adjustment (if needed). | Posts via posting service. |

**Bug checks**

- [ ] Cancel reservation restores ATP.
- [ ] Issue without stock → blocked (no negative silent balance).
- [ ] SD order fulfillment: see [MM_SD_INTEGRATION.md](./MM_SD_INTEGRATION.md) — POS fast-track posts PGI on checkout.

**Automated tests:** `inventory.spec.ts`, `inventory-reservation-integration.spec.ts`, `reservation-allocation-engine.spec.ts`, `sd-mm-integration.spec.ts`, `stock-ops.spec.ts`.

---

## Phase 7 — Warehouse execution (outbound)

**Purpose:** Physical pick/pack/ship handoff to SCM.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 7.1 | `/modules/mm/warehouse-management/task-queue` | Pick tasks from demand. | Tasks assigned. |
| 7.2 | `/modules/mm/warehouse-management/picking` | Confirm picks (scan bin/material). | Picked qty; on-hand unchanged until GI/dispatch. |
| 7.3 | `/modules/mm/warehouse-management/packing` | Pack into packages. | Package `READY_FOR_DISPATCH`. |
| 7.4 | SCM handoff | Shipment created from package (idempotent). | Trip/dispatch in SCM module. |
| 7.5 | Dispatch / trip start | GI posts from package. | Package `DISPATCHED`; stock reduced. |

**Mobile / scan**

- `/modules/mm/barcode-rfid/mobile-picking`
- `/modules/mm/barcode-rfid/mobile-receiving`

**Bug checks**

- [ ] Pick short → Exception Center **warehouse** `PICK_SHORT`.
- [ ] Double confirm pick → idempotent or clear error.

**Automated tests:** `outbound.spec.ts`, `mobile-warehouse-execution.spec.ts`, `scanner.spec.ts`.

---

## Phase 8 — Stock transfers

**Purpose:** Move stock plant/WH/bin; in-transit handling.

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 8.1 | `/modules/mm/inventory-management/stock-transfers` or WH transfers | Create transfer order. | STO released. |
| 8.2 | `/modules/mm/warehouse-management/in-transit` | Goods in transit. | Qty not in source bin unrestricted. |
| 8.3 | `/modules/mm/warehouse-management/transfer-receipts` | Receive at destination. | Dest on-hand ↑; transit cleared. |

**Automated tests:** `stock-transfer-order-engine.spec.ts`.

---

## Phase 9 — Inventory control (cycle / physical count)

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 9.1 | `/modules/mm/inventory-control/count-planning` | Plan counts. | Plan published. |
| 9.2 | `/modules/mm/inventory-control/count-sessions` | Open session. | Counters assigned. |
| 9.3 | `/modules/mm/inventory-control/cycle-counting` or `physical-inventory` | Enter counts. | Blind count hides book qty if enabled. |
| 9.4 | `/modules/mm/inventory-control/variance-analysis` | Review variance. | Variance qty computed. |
| 9.5 | `/modules/mm/inventory-control/recounts` | Recount if needed. | Second count recorded. |
| 9.6 | `/modules/mm/inventory-control/adjustment-approval` | Approve adjustment. | **COUNT_GAIN/LOSS** posting. |

**Automated tests:** `inventory-control.spec.ts`, `inventory-control-count-engine.spec.ts`.

---

## Phase 10 — Planning / MRP (plan-only)

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 10.1 | `/modules/mm/planning-mrp/demand` | Manual/planned demand. | Demand visible to MRP. |
| 10.2 | `/modules/mm/planning-mrp/reorder-point` / `safety-stock` | Parameters on material. | Shortage logic triggers. |
| 10.3 | `/modules/mm/planning-mrp/mrp-runs` | Run MRP. | Run completes; **no inventory posting**. |
| 10.4 | `/modules/mm/planning-mrp/procurement-suggestions` | Review suggestions. | Convert to PR manually. |
| 10.5 | `/modules/mm/planning-mrp/shortage-monitor` | Monitor shortages. | Aligns with run output. |

**Automated tests:** `planning.spec.ts`, `mrp-*-phase*.spec.ts`, `advanced-mrp-engine.spec.ts`.

---

## Phase 11 — Valuation & FICO bridge

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 11.1 | `/modules/mm/valuation/standard-cost` or `moving-average` / `fifo` | Set/load costing method. | Cost on GR/GI consistent. |
| 11.2 | `/modules/mm/valuation/inventory-valuation` | Valuation report. | Matches ledger × cost. |
| 11.3 | `/modules/mm/valuation/landed-cost` | Allocate freight/duty. | Layer cost updated. |
| 11.4 | `/modules/mm/valuation/price-variance` | PPV/IPV. | Variances auditable. |

**Bug checks**

- [ ] `MmAccountingEvent` outbox rows after GR/GI (FICO consumer — see [MM_FICO_INTEGRATION.md](./MM_FICO_INTEGRATION.md)).

**Automated tests:** `valuation.spec.ts`, `valuation-landed-cost-engine.spec.ts`, `mm-fico-accounting.spec.ts`.

---

## Phase 12 — Returns, disposal, quality closure

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 12.1 | `/modules/mm/receiving/nonconformances` | NC from failed inspection. | NC linked to lot/receipt. |
| 12.2 | `/modules/mm/returns-disposal/supplier-returns` | Return to supplier. | `RETURN_OUT` posting. |
| 12.3 | `/modules/mm/returns-disposal/damaged-stock` / `scrap` / `disposal` | Scrap path. | Stock ↓; trace intact. |
| 12.4 | `/modules/mm/returns-disposal/customer-return-intake` | Customer return (MM side). | QI → restock/scrap decision. |

**Automated tests:** `returns-disposal.spec.ts`, `returns-disposal-traceability-engine.spec.ts`, `corrective-action.spec.ts`.

---

## Phase 13 — Barcode / RFID & reports

| Step | UI route | Do | Pass criteria |
| --- | --- | --- | --- |
| 13.1 | `/modules/mm/barcode-rfid/barcode-scanning` | Scan lookup. | Resolves material/bin. |
| 13.2 | `/modules/mm/reports-analytics/stock-reports` | Stock report. | Matches stock overview totals. |
| 13.3 | `/modules/mm/dashboard` | Analytics dashboard. | Charts load (role visibility respected). |
| 13.4 | `/modules/mm/exception-center` | Final sweep. | No unexpected CRITICAL/HIGH. |

**Automated tests:** `reports.spec.ts`, `analytics.spec.ts`, `exception-center.spec.ts`.

---

## Cross-module smoke (after MM Phase 5+)

| Integration | What to run | Pass criteria |
| --- | --- | --- |
| **SD ↔ MM** | SD sales order or POS checkout for product linked to MM material | ATP decreases; reservation/issue per lane; no double PGI. |
| **SD catalog** | `/modules/sd/product-catalog` stock column | Availability API matches MM ATP. |
| **FICO** | Post GR/GI then check accounting events / GL stub | Events emitted; period closed blocks post. |
| **SCM** | Pack → ready for dispatch → trip start | GI from package once. |
| **PP** | Production reservation/issue (if PP enabled) | `pp-mm-integration.spec.ts` scenarios. |

---

## Automated test status (last run)

Command:

```bash
cd backend
npm test -- --testPathPatterns=mm --runInBand --forceExit
```

**Result snapshot:** 61 suites — **48 passed**, **13 failed** (507 tests passed, 114 failed).

Failures are **mostly test-module wiring** (Nest DI mocks missing new dependencies), not necessarily production runtime bugs:

| Failed suite | Typical failure |
| --- | --- |
| `warehouse-ops.spec.ts`, `mm03-warehouse.spec.ts` | `PackingService` missing `ShipmentsService` in test module |
| `purchase-order.spec.ts`, `po-supplier-gate.spec.ts` | `PurchaseOrderService` missing `DocumentFlowService` |
| `procurement-p2p-hardening.spec.ts` | Same DocumentFlow / module import drift |
| `inbound.spec.ts`, `outbound.spec.ts`, `stock-ops.spec.ts` | Related service dependency not mocked |
| `three-way-match.spec.ts`, `valuation*.spec.ts` | Test harness / prisma mock gaps |
| `materials.service.spec.ts`, `corrective-action.spec.ts` | Provider resolution in unit tests |

**Still trustworthy for regression:** architecture specs (`npm run test:architecture`), `document-flow.spec.ts`, `inventory.spec.ts`, `exception-center.spec.ts`, many MRP/inventory-control unit tests.

**Recommendation:** Fix failing specs by adding `{ provide: DocumentFlowService, useValue: … }` and `ShipmentsService` mocks to match production constructors — then re-run the full MM suite after each release.

---

## Quick “one day” regression path

If time is limited, run this **minimum happy path**:

1. Organization → Material → Supplier + supplier material → Warehouse + bins  
2. PR → PO → Receive → Stock overview + ledger  
3. Reservation → Pick → Pack → (GI or POS/SD issue)  
4. Exception Center + stock overview reconciliation  
5. `npm run test:architecture` + `document-flow.spec.ts` + `inventory.spec.ts`

---

## Related docs

- [MM_DEPENDENCY_MAP.md](./MM_DEPENDENCY_MAP.md) — build order & ownership  
- [MM_TRANSACTION_RULES.md](./MM_TRANSACTION_RULES.md) — posting rules  
- [MM_SD_INTEGRATION.md](./MM_SD_INTEGRATION.md) · [MM_FICO_INTEGRATION.md](./MM_FICO_INTEGRATION.md)  
- [.cursor/skills/materials-management/SKILL.md](../.cursor/skills/materials-management/SKILL.md)
