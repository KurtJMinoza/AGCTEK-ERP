# MM Transaction Rules

## Posting rules

1. All physical stock changes flow through `InventoryPostingService`.
2. Posted transactions are immutable — corrections use reversal.
3. `idempotencyKey` prevents duplicate posts (mobile retry, network replay).
4. Outbound posts check available stock unless `negativeStockAllowed` on material.
5. Batch-managed materials require `batchId`; serial-managed require `serialNumberId`.
6. Quantities normalize to base UOM via `UomConversionsService`.
7. Concurrent updates use Serializable isolation + balance `version` optimistic lock.
8. Inter-warehouse transfers post `TRANSFER_OUT` + `TRANSFER_IN` atomically in one Serializable transaction.

## Field mapping (API / ledger)

| Conceptual field | Prisma / DTO field |
| --- | --- |
| `referenceType` | `sourceDocumentType` |
| `referenceId` | `sourceDocumentId` |
| `referenceLineId` | `sourceDocumentLineId` |
| `postedBy` | `createdBy` |
| `reversalOfTransactionId` | `reversalOfId` |

### Ledger read enrichment (read-only)

`GET /api/v1/mm/inventory/ledger` enriches each posting for display. It never
changes ledger data — the resolver only *reads* the owning document.

| Field | Meaning |
| --- | --- |
| `sourceReference` | The origin document's business number (`GR-2026-00012`, `SO-000045`, `MAT-000010`), resolved from `sourceDocumentType` + `sourceDocumentId` |
| `reversalOf` | The reversed posting's `transactionNumber` |
| `reversedBy` | The reversal posted against this posting, when it was reversed |

Owner: `backend/src/mm/inventory/inventory-source-reference.resolver.ts`
(`InventorySourceReferenceResolver`). Resolution is best-effort: an unknown
source type or a deleted document yields no `sourceReference`, and the ledger
still renders. The raw pointer stays in `sourceDocumentId` / `sourceDocumentType`
for technical lookups.

The same endpoint also returns a **ledger summary** over the whole filter (not
the current page):

```json
{
  "summary": {
    "total": 15,
    "inboundQuantity": 1474,
    "outboundQuantity": 1099,
    "reversals": 3
  }
}
```

### List-endpoint status summaries

The document lists (Goods Issue, Goods Receipt, Adjustments, Bin Transfer,
Warehouse Transfer Order, Reservations) return a server-side status breakdown
alongside the page of rows, so the UI tiles never depend on what happens to be
on screen:

```json
{ "summary": { "byStatus": [{ "status": "POSTED", "count": 4 }] } }
```

Owner: `backend/src/mm/common/status-summary.util.ts` (`toStatusCounts`).

## Movement types

| Type | Direction | Use |
| --- | --- | --- |
| `RECEIPT` | + | Goods receipt, return in |
| `ISSUE` | − | Goods issue, consumption |
| `TRANSFER_OUT` | − | Source leg of transfer |
| `TRANSFER_IN` | + | Destination leg of transfer |
| `COUNT_GAIN` | + | Cycle count surplus |
| `COUNT_LOSS` | − | Cycle count shortage |
| `RETURN_OUT` | − | Supplier return |
| `RETURN_IN` | + | Customer return |
| `SCRAP` | − | Disposal |
| `ADJUSTMENT_IN` | + | Manual increase |
| `ADJUSTMENT_OUT` | − | Manual decrease |
| `STATUS_CHANGE` | ±0 net | Move qty between stock statuses |

## Stock statuses

`UNRESTRICTED` | `QUALITY_INSPECTION` | `BLOCKED` | `QUARANTINE` | `IN_TRANSIT` | `EXPIRED` | `DAMAGED`

Only `UNRESTRICTED` stock counts toward ATP (minus reservations).

## Availability

```text
Available = Unrestricted On-Hand − Reserved
```

Restricted statuses contribute to `restrictedStock` in ATP response, not to available.

## Reservation

- Creates `MmInventoryReservation` record
- Increments `reservedQuantity` on balance rows
- Decrements `availableQuantity` (not `quantity`)
- Does not create inventory transaction

## Reversal

1. Validate original exists and is not already reversed
2. Create new transaction with negated quantities linked via `reversalOfId`
3. Update balances in opposite direction
4. Reverse valuation layers
5. Write audit record — original row unchanged

## Idempotency key convention

```text
{domain}:{documentId}:{lineId}:{suffix}
```

Examples: `gr:{grId}:{lineId}:good`, `issue:{giId}:{lineId}`, `adj:{adjId}:{lineId}`

## Audit

Every post records in `MmInventoryAudit`: user, timestamp, movement, quantity, dimensions, idempotency key (in changes JSON).
