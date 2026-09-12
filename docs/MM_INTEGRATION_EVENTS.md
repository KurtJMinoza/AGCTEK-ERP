# MM Integration Events

Canonical domain events for cross-module integration (FICO, SD, Production, notifications, reporting, audit).

Events are emitted in-process via `EventEmitter2` and persisted to `MmAccountingEvent` when financially or operationally relevant.

## Event catalog

| Canonical event | Emitter | Payload highlights | Consumers |
| --- | --- | --- | --- |
| `GoodsReceiptPosted` | `goods-receipt.service` | `goodsReceiptId`, company, lines | FICO (GR/IR), MM-09 putaway |
| `GoodsIssuePosted` | `goods-issue.service` | `goodsIssueId`, issuePurpose, lines | FICO (COGS), SD |
| `InventoryAdjusted` | `adjustment.service` | document id, lines, reason | FICO, MM-14 reports |
| `InventoryTransferred` | `inter-warehouse-posting.ts` | transfer id, from/to warehouse | FICO, MM-09 |
| `ReservationCreated` | `reservation.service` | reservation id, qty, source doc | MM-09 picking, notifications |
| `ReservationReleased` | `reservation.service` | reservation id (cancel/fulfill) | Availability refresh |
| `QualityDecisionMade` | `quality-inspection.service` | inspection id, pass/fail qty | MM-09 putaway, blocked stock |
| `SupplierReturnPosted` | `supplier-return.service` | return id, lines | FICO, MM-02 supplier perf |
| `InventoryTransactionPosted` | `inventory-posting.service` | transaction id, movement | Audit, traceability |
| `InventoryTransactionReversed` | `inventory-posting.service` | reversal + original ids | Audit, FICO reversal |
| `StockBelowSafetyLevel` | `planning/` (reorder) | material, warehouse, qty | Notifications, MM-06 PR |
| `PurchaseOrderOverdue` | `purchase-order.service` / alerts | po id, due date | Notifications, MM-13 |

## Legacy aliases (still emitted)

| Legacy string | Maps to |
| --- | --- |
| `goods-receipt.posted` | `GoodsReceiptPosted` |
| `goods-issue.posted` | `GoodsIssuePosted` |
| `inventory.transaction.posted` | `InventoryTransactionPosted` |
| `inventory.transaction.reversed` | `InventoryTransactionReversed` |
| `inventory.stock.changed` | Internal MM-08 (not integration) |
| `accounting.entry.requested` | FICO bridge stub (`MmAccountingEvent`) |

## Payload contract (minimum)

```typescript
{
  eventType: string
  companyId: string
  sourceModule: string
  documentType: string
  documentId: string
  occurredAt: string // ISO
  payload: Record<string, unknown>
}
```

## Persistence

Financially relevant events are written to `mm_accounting_events` with `status: PENDING` for downstream FICO consumption. Use `MmDomainEventsService` — do not duplicate outbox tables.

## Idempotency

Integration consumers must treat `(eventType, documentType, documentId)` as dedupe key. Posting layer uses `idempotencyKey` on `MmInventoryTransaction` to prevent duplicate physical stock.
