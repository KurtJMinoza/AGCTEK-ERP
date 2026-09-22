# MM Forbidden Patterns

Catalog of architecture violations. Each pattern maps to an automated rule where practical.

Related: [MM_ARCHITECTURE_RULES.md](./MM_ARCHITECTURE_RULES.md) · `backend/src/mm/architecture/mm-guardrails.spec.ts`

---

## Summary table

| Rule ID | Forbidden | Expected architecture | Enforced |
| --- | --- | --- | --- |
| MM-08-QUANTITY | Direct `mmInventoryBalance` write outside allowlist | `InventoryPostingService` (qty) or reservation util (reserved/available) | ✅ Test |
| MM-08-RESERVATION | Balance mutation outside reservation allowlist | `reservation-balance.util.ts`, `ReservationService` | ✅ Test |
| MM-08-LEDGER | Ledger create/update outside posting/valuation | `InventoryPostingService`, `ValuationEngineService` | ✅ Test |
| MM-05-MRP | MRP calling posting | Planning reads only | ✅ Test |
| MM-06-PROCUREMENT | Procurement posting inventory | PO → receiving → GR → posting | ✅ Test |
| MM-07-QUALITY | Quality/receiving direct balance/ledger writes | `QualityDecisionService` → STATUS_CHANGE posting | ✅ Test |
| MM-12-SCANNER | Scanner/mobile direct posting | Task execution → stock-ops → posting | ✅ Test |
| MM-INT-EXTERNAL | Non-MM modules writing MM inventory tables | MM integration API + events | ✅ Test |
| MM-08-IDEMPOTENCY | `postTransaction` without `idempotencyKey` in stock-ops | `postingKey()` helper | ✅ Test |
| MM-FE-NOMATH | Frontend ATP/stock arithmetic | Display API fields only | ✅ Test |
| MM-INT-OUTBOX | Dual EventEmitter + MmDomainEventsService | Single publish path | ✅ Test (legacy allowlist) |

---

## MM-08-QUANTITY — Direct balance quantity update

**Forbidden:**

```typescript
await prisma.mmInventoryBalance.update({ data: { quantity: newQty } })
```

**Allowed writers:**

| File | Purpose |
| --- | --- |
| `inventory/inventory-posting.service.ts` | Physical quantity changes |
| `inventory/reservation-allocation/reservation-balance.util.ts` | Reservation fields only |
| `outbound/reservation.service.ts` | Legacy reservation path |

---

## MM-08-LEDGER — Direct ledger mutation

**Forbidden:** creating/updating `MmInventoryTransaction` outside:

- `inventory/inventory-posting.service.ts`
- `valuation/valuation-engine.service.ts` (cost extensions)

Corrections use **reversal** transactions — never UPDATE posted rows.

---

## MM-05-MRP — MRP posting inventory

**Forbidden in `planning/`:**

```typescript
import { InventoryPostingService } from '../inventory/...'
await this.posting.postTransaction(...)
```

MRP outputs requirements and suggestions; supply execution is procurement + receiving.

---

## MM-06-PROCUREMENT — Procurement posting inventory

**Forbidden in procurement domains:** `postTransaction`, `InventoryPostingService`.

Procurement ends at PO. Inbound quantity enters via `GoodsReceiptService`.

---

## MM-07-QUALITY — Quality editing inventory balance

**Forbidden in `quality/` and `receiving/`:**

- `mmInventoryBalance.*`
- `mmInventoryTransaction.create`

Quality changes **status** via posting `STATUS_CHANGE` movement type.

---

## MM-12-SCANNER — Scanner writing inventory directly

**Forbidden in `scanner/`:**

- `postTransaction(`
- `mmInventoryBalance.update/create`

Mobile executes warehouse tasks; completion handlers delegate to stock-ops.

---

## MM-INT-EXTERNAL — External modules changing MM tables

**Forbidden in `sd/`, `pp/`, `fico/`, `scm/`:**

```typescript
prisma.mmInventoryBalance.create(...)
prisma.mmInventoryTransaction.update(...)
```

Use `SdIntegrationService`, `ProductionIntegrationService`, or consume MM events.

---

## MM-08-IDEMPOTENCY — Non-idempotent posting

**Forbidden:**

```typescript
await this.postingService.postTransaction({ /* no idempotencyKey */ })
```

**Required:**

```typescript
idempotencyKey: postingKey('gr', doc.id, line.id, 'good')
```

Applies to stock-ops services: goods-receipt, goods-issue, adjustment, bin-transfer, warehouse-transfer-order.

---

## MM-FE-NOMATH — Frontend inventory mathematics

**Forbidden in `src/modules/mm/`:**

```typescript
const available = onHand - reserved
const atp = unrestrictedOnHand - existingReservations
```

**Allowed:** display `available`, `onHand`, `unrestrictedOnHand` from API responses.

---

## MM-INT-OUTBOX — Duplicate event publishing

**Forbidden (new code):** emitting the same business fact through both:

```typescript
this.domainEvents.emit({ ... })
this.events.emit('quality.inspection.completed', { ... })
```

**Known legacy (allowlisted until migrated):**

- `receiving/quality-decision.service.ts`

New services must use `MmDomainEventsService` only.

---

## NEGATIVE_STOCK_ATTEMPT — Not yet persisted

Rejected negative postings are blocked in `InventoryPostingService` but not stored as queryable exceptions. Do not add parallel “attempt logs” without architecture review.

---

## Running checks

```bash
cd backend
npm run test:architecture
```

Failure output format:

```text
[MM-07-QUALITY] backend/src/mm/receiving/example.service.ts:42
  Forbidden: mmInventoryBalance\.(update|create)
  Expected:  Quality changes stock status via QualityDecisionService → STATUS_CHANGE posting
  Snippet:   await tx.mmInventoryBalance.update({
```

Fix the violation or update allowlist only with architecture approval documented in PR description.
