# MM Domain Boundaries

## MM-08 owns

- Inventory transactions (ledger)
- Inventory balances (operational state)
- Reservations and availability
- Stock status dimensions
- Traceability queries
- Physical posting (receipt, issue, transfer, adjustment, count, status change, reversal)

## MM-08 does not own

- Material master identity (MM-01)
- Warehouse topology master (MM-03) — consumes FKs
- Goods receipt **documents** (MM-08 stock-ops posts through engine)
- Putaway/picking **tasks** (MM-09) — tasks call posting on confirm
- Valuation policy setup (MM-04) — engine applies rules at post time

## Document → posting responsibility

| Document | Owner module | Posts via | Reversal |
| --- | --- | --- | --- |
| Goods Receipt | stock-ops / MM-08 | `RECEIPT` | Reverse each ledger line |
| Goods Issue | stock-ops / MM-08 | `ISSUE` | Reversal transaction |
| Adjustment | stock-ops / MM-08 | `ADJUSTMENT_IN/OUT` | Reversal |
| Cycle count variance | MM-10 | `COUNT_GAIN/LOSS` | Reversal |
| Bin transfer | MM-09 / stock-ops | `TRANSFER_OUT/IN` | Reversal pair |
| Inter-warehouse transfer | MM-09 | `TRANSFER_OUT/IN`, `IN_TRANSIT` | Document reversal |
| Quality inspection release | MM-07 | `STATUS_CHANGE` | Status change back |
| Supplier return | MM-11 | `RETURN_OUT` | Reversal |
| Customer return | MM-11 | `RETURN_IN` | Reversal |
| Disposal / scrap | MM-11 | `SCRAP` | Reversal |

## Scanner (MM-12)

Scanner is an execution channel only. It dedupes via `MmScannerEvent.idempotencyKey` and delegates to domain services — never maintains a separate inventory engine.

## Planning (MM-05)

MRP and planning modules may read balances and ATP. They must **never** import or call `InventoryPostingService`.
