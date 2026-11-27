# FICO Phase 04 — MM ↔ FICO accounting integration

Phase 04 completes the financially relevant Materials Management posting matrix on top of the
Phase 03 automatic journal engine (`mm_accounting_events` → `FicoAccountingEventProcessorService` →
`FicoJournalService.createFromAccountingEvent`). MM retains inventory and valuation; FICO owns journals.

## Posting matrix (supported)

| Movement | Domain event | Transaction key | Notes |
| --- | --- | --- | --- |
| Valuated GR | `GoodsReceiptPosted` | `GR_IR` | Dr Inventory / Cr GRIR |
| GR reversal | `GoodsReceiptReversed` | `GR_IR` | Direction reversed |
| GI sales | `GoodsIssuePosted` | `GI_COGS` | Dr COGS / Cr Inventory |
| GI internal | `GoodsIssuePosted` | `CONSUMPTION_EXPENSE` | Non-sales consumption |
| GI reversal | `GoodsIssueReversed` | per purpose | Direction reversed |
| Adjustment gain | `InventoryAdjusted` | `INVENTORY_GAIN` | IN movement |
| Adjustment loss | `InventoryAdjusted` | `INVENTORY_LOSS` | OUT movement |
| Scrap / disposal | `ScrapPosted` / `DisposalPosted` | `INVENTORY_LOSS` | |
| Supplier return | `SupplierReturnPosted` | `GR_IR` | Direction reversed (GRIR reversal) |
| Customer return restock | `CustomerReturnPosted` | `GI_COGS` | Direction reversed (restore stock, undo COGS) |
| Customer return reversal | `CustomerReturnReversed` | `GI_COGS` | Normal GI_COGS direction |
| Landed cost / PPV | `LandedCostAllocated` / `PriceVariancePosted` | `LANDED_COST` / `PURCHASE_VARIANCE` | Valuation engine |
| Stock transfer | `InventoryTransferred` | — | Non-financial (no journal) |
| Valuation snapshot | `InventoryValuationUpdated` | — | Non-financial audit trail |

PR/PO approval, reservations, picks, and same-company same-valuation transfers do not post GL.

## Customer return bridge (fixed)

`CustomerReturnService.complete` emits `CustomerReturnPosted` through `MmDomainEventsService` with v2
lines and hints (`INVENTORY_INCREASE`, `COGS_EXPENSE`). `REFUND_ONLY` lines skip stock and accounting;
`SCRAP` lines route financial effect to linked disposal posting.

## Accounting posting status on MM documents

Columns `accountingPostingStatus` on goods receipts/issues, adjustments, returns, and disposals.
States: `NOT_FINANCIALLY_RELEVANT`, `PENDING_ACCOUNTING`, `ACCOUNTING_PROCESSING`, `ACCOUNTING_POSTED`,
`ACCOUNTING_FAILED`, `ACCOUNTING_REVERSED`.

Synced via `accounting.event.status.changed` from accounting event persist + FICO processor outcomes
(`MmAccountingStatusListener`).

## Traceability

Accounting v2 payloads carry material lines, warehouse/plant, movement type, costs, and optional
`documentReferences` (e.g. SD sales return, damage report). Journals link through `mm_accounting_events`
`journalEntryIds`.

## Validation

- `npx jest backend/src/fico` — determination and posting policies
- `npx jest backend/src/mm/integration/fico/mm-fico-accounting.spec.ts` — envelope + consumer contract
- Returns specs under `backend/src/mm/returns-disposal/`