# SCM Delivery Damage Report → SD Sales Return → MM Intake — Design Notes

Status: **Phase 2 (SCM Delivery Damage Report), Phase 3 (SD Sales Return + SCM→SD handoff), Phase 4 (SD → MM customer return intake) and Phase 5 (cross-module UI) implemented**.

## Two recorded decisions

### Decision 1 — Integration mechanism

> Reuse existing cross-module infrastructure where practical; otherwise use a direct
> application-service call only after validating the dependency graph.

- **Applied in Phase 2:** the damage report is SCM-internal. Company-scope and sales-order
  resolution reuse the existing SCM shipment resolver (`Shipment → package → picking task →
  MM reservation header`, plus `Shipment`'s legacy `SALES_ORDER:<id>` source); no new
  cross-module dependency was introduced in Phase 2.
- **Planned for Phase 3:** SCM must **not** write SD tables. The handoff to SD Sales Return will
  either reuse the SD event/outbox conventions (`SdEventOutbox` + `SdEventEmitterService`, and/or
  the MM outbox + `MmEventConsumerService.handleIdempotent` consumers) or call an exported SD
  application service (`SdReturnService.initiateFromDamageReport`) — the choice to be validated
  against the module graph first. NOTE: SCM has no outbox today, and `SCM → SD` is a brand-new
  module edge (`docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md` §21, §25). The graph must be validated
  (forwardRef ordering for `ScmModule ↔ SdModule ↔ MmModule`) before coding Phase 3.
- **Planned for Phase 4:** SD → MM intake uses the existing MM `CustomerReturnService` and the
  pre-existing `MmCustomerReturn.sdReturnRequestRef` stub; the currently unused
  `CustomerReturnPosted` event catalog entry (`mm-event-catalog.registry.ts`) becomes the contract.

### Decision 2 — Sales-order resolution

> Require a verifiable relationship before automatically creating an SD Sales Return, and
> explicitly handle shipments whose original order cannot be resolved.

- A `DamageReport` records whatever order the **verified** chain provably links:
  `Shipment.package → WmPackage.pickingTask → MmInventoryReservationHeader(sourceModule='SD',
  sourceDocumentType='SALES_ORDER')`, falling back to the legacy `SALES_ORDER:<id>` source
  (`ShipmentsService.resolveSalesOrderId`).
- Result is stored as `salesOrderId` + `salesOrderStatus` (`RESOLVED`/`UNRESOLVED`).
- **UNRESOLVED is explicit, not guessed:** the report is still saved (damage reporting never
  blocks on order resolution), but the SD Sales Return handoff (Phase 3) refuses to run, and
  `companyId` cannot be silently assumed — the caller must supply it when no order resolves
  (`DamageReportsService` validates accordingly).
- No SO-line ↔ shipment-line mapping exists (the plan does not fabricate one); the SD return
  lines will reference `SdSalesOrderLine`/`materialId`, while the SCM report references the
  physical `ShipmentLine`. They relate by material, not by FK — intentional.

## Phase 2 scope (shipped)

- `DamageReport` + `DamageReportAudit` (SCM-owned, SCM table naming convention, no `@@map`).
- `POST /api/v1/scm/shipments/:shipmentId/damage-reports`, `GET ...(list)`, `GET .../:id`,
  `POST .../:id/cancel`.
- Status model: `SUBMITTED → CANCELLED` (`RETURN_CREATED` reserved for Phase 3).
- Idempotency: optional unique `idempotencyKey` on create; a resubmit returns the existing report.
- The delivery history is never rewritten (report is a linked child document; shipments keep
  their `DELIVERED`/`EXCEPTION_HOLD` record).
- Permissions reuse `scm.shipments` (create/update) and the shared shipment read codes — no new
  permission resource yet; backend authz is enforced per-route.
- Out of scope (unchanged): inventory posting, FICO, CRM RMA, MM intake wiring
  (`sdReturnRequestRef`), `CrmTicketComment`.

## Phase 3 — SD Sales Return + SCM→SD handoff (shipped)

### Integration mechanism (Decision 1 applied)
- SCM now calls SD through a **direct exported application-service call**
  (`SdReturnService.create`, injected into `DamageReportsService`) inside one shared
  `Prisma.TransactionClient` — the same cross-module pattern CRM's Closed Won handoff uses
  (`SalesOrderService.createFromCrmOpportunity(..., { tx })`). The SD write and the SCM link
  commit atomically; SD checks `sd.sales-returns:create` itself (service-level assertion,
  mirroring the CRM handoff), so the SCM route stays `scm.shipments:update`.
- Module graph was inspected first: the new edge `ScmModule → SdModule` closes a 3-cycle
  (`SCM → SD → MM → SCM`) that is **already fully covered by `forwardRef`** on the SD→MM and
  MM→SCM edges; the new edge is added as `forwardRef(() => SdModule)` too. No SCM outbox was
  added; `DamageReportSubmitted` is a fact, but `CreateSalesReturnFromDamageReport` is a
  *command* that needs an explicit, synchronous, idempotent result.
- **Export seam:** `SdModule` exports `SalesReturnService`; `ScmModule` imports
  `forwardRef(() => SdModule)`.

### SD Sales Return domain
- `SdSalesReturn` (+`SdSalesReturnLine`, +`SdSalesReturnAudit`), `@@map sd_sales_returns`; the
  header carries `salesOrderId`, `companyId`, `customerId`, `damageReportId @unique`, and a
  lifecycle `REQUESTED → AUTHORIZED | REJECTED | CANCELLED` (AUTHORIZED → CANCELLED allowed).
- **Create ≠ authorize:** new returns are always `REQUESTED`; `authorize` is a separate,
  explicit SD transition (Phase 4 will open the MM intake from AUTHORIZED). SD service,
  controller routes, DTOs, and permission resource `sd.sales-returns`
  (`permissions.constants.ts`) are in place.
- Enforcement: only `CONFIRMED`/`COMPLETED` orders are returnable; every return line must
  reference a real order line and (when supplied) a matching `materialId`; returnable quantity
  is computed atomically (`SELECT … FOR UPDATE` on order lines + sum of prior non-cancelled /
  non-rejected returns); `damageReportId @unique` is the DB-level idempotency backstop.

### SCM → SD handoff (`POST scm/shipments/:shipmentId/damage-reports/:id/initiate-return`)
- Only `SUBMITTED` + `RESOLVED` + **line-level** reports can be handed off. UNRESOLVED,
  whole-shipment, cancelled, or already-returned reports are rejected with explicit messages and
  stay for manual handling.
- **Exact line resolution (guardrail 2):** `ShipmentLine.packageItemId → WmPackageItem →
  MmInventoryReservationHeader(source SD / SALES_ORDER / report.salesOrderId) →
  MmInventoryReservationLine.materialId` must yield **exactly one distinct
  `demandReferenceLineId` (= SdSalesOrderLine.id)**. Zero or >1 → the handoff is rejected
  (never guessed).
- The handoff claims the report (`updateMany where status=SUBMITTED` → `RETURN_CREATED`) inside
  the transaction; a losing concurrent caller returns the winner's existing return; any later
  failure rolls the whole transaction back, leaving the report `SUBMITTED` and retryable.
- Recovery semantics: SD-created-but-link-failure cannot occur (single transaction); retries are
  safe via the claim + `damageReportId @unique`; a second successful retry after creation
  returns a clear "already created" conflict that the UI surfaces with the return number.

### Phase 3 boundary
- MM intake, inventory posting, credit memos, and FICO effects are **not** created here.
  AUTHORIZED is reachable via explicit SD action only.

## Phase 4 — SD → MM customer return intake (shipped)

### Chain and ownership
- Full chain: `SCM DamageReport → SD SdSalesReturn (@unique damageReportId) → MM MmCustomerReturn`.
  Each module keeps its own record id; references connect them.
- MM owns the intake. The two references live on the MM record as real foreign keys:
  - `MmCustomerReturn.sdSalesReturnId @unique` → `SdSalesReturn` (unique ⇒ one intake per return);
  - `MmCustomerReturn.damageReportId` → `DamageReport` (originating delivery damage).
  SD/MM do **not** write SCM's `DamageReport` table. The pre-existing `SdSalesReturn.customerReturn`
  back-relation exposes the intake from the SD side, and the reserved plain `DamageReport.customerReturnId`
  stays available for a future SCM-owned back-reference (not written cross-module here).
- The legacy free-text `MmCustomerReturn.sdReturnRequestRef` is kept for backward compatibility only;
  it is not the link.

### Integration mechanism
- Direct application-service call, mirroring the CRM/SD and SCM/SD handoffs: `SalesReturnService`
  (SD) injects the now-exported `CustomerReturnService` (MM) and calls
  `createFromSalesReturn(...)`. No MM table is written from SD, and no SD table from MM.
- `POST /api/v1/sd/sales-returns/:id/initiate-intake` (`sd.sales-returns:update`); the MM service
  additionally asserts `mm.returns-disposal.customer-return-intake:create` because the cross-module
  caller bypasses the MM controller.
- Only an `AUTHORIZED` return may be intaken. The MM intake is created as `DRAFT` (expected
  quantities, no batch/serial unless supplied per line) and then continues through the existing MM
  lifecycle (intake → inspection → disposition → complete). Materials/warehouses reuse master data.

### Reliability
- Idempotency: the unique `MmCustomerReturn.sdSalesReturnId` is the DB backstop; a pre-check returns
  the existing intake, and a concurrent insert (`P2002`) returns the winner — a retried handoff can
  never open a second intake.
- If the MM create fails, the SD return stays `AUTHORIZED` and the handoff is retryable; no SD change
  is committed. Warehouse defaults to the return's `warehouseId` and is required when neither is set.
- No inventory posting, credit memo, or FICO effect is created by the handoff (that remains in the
  MM `complete` step, which Phase 4 does not invoke).

## Phase 5 — Cross-module user experience (shipped)

The chain is navigable from any of the three records; no central returns dashboard was added.

- **SD Sales Returns** (new owner surface): `src/modules/sd/pages/SalesReturns.tsx`, route
  `/modules/sd/sales-returns` (nav under SD → Transactional, resource `sd.sales-returns`). Lists
  returns and opens a detail with the original sales order, the originating SCM damage report, the
  related MM intake, the return lines, and the actions `Authorize` / `Reject` / `Cancel` /
  `Open MM intake`. It is also the target of deep links (`?returnId=…`).
- **SCM**: the damage-report dialog (`DamageReportDialog.tsx`) links each report that created a return
  to the SD return (`/modules/sd/sales-returns?returnId=<sdSalesReturnId>`).
- **MM**: the customer-return-intake detail (`CustomerReturnIntakePage.tsx`) shows the linked SD
  return and originating SCM damage report / delivery, links back to the SD return, and supports
  `?returnId=` deep links from SD.
- **Read models**: `SdSalesReturn` gained a real `damageReport` relation; SD `returnInclude` now
  returns `damageReport` + `customerReturn`, and MM `DETAIL_INCLUDE` returns `sdSalesReturn` +
  `damageReport`, so each screen shows references without extra round-trips.
- UI changes stay additive: no existing page was restructured, and no inventory/FICO/supplier-return
  surface was touched.