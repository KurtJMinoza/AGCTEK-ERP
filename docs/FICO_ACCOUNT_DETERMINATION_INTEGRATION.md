# FICO Account Determination — Integration Contracts

Distinguishes **configured** transaction keys from **operational** integrations.
Posting pipeline detail: [FICO_POSTING_PIPELINE_PHASE0420.md](FICO_POSTING_PIPELINE_PHASE0420.md).

## 1. Posting contract

Operational modules publish a durable accounting event and never pick accounts:

```text
MmAccountingDispatchPayload
  companyId · eventType · documentType · documentId
  postingDate · currencyCode · totalValue
  accountingEffects[] · idempotencyKey · sourceEventId
  lines[]: materialId, warehouseId, quantity, unitCost, totalCost,
           valuationClassId, materialTypeCode, movementType
```

The FICO consumer claims the event, resolves accounts centrally, validates, posts, and records the journal id on the event.

## 2. MM integration (operational)

| Transaction | Event | Keys | Status |
| --- | --- | --- | --- |
| Valuated goods receipt | `GoodsReceiptPosted` | `GR_IR`, inventory | LIVE |
| Goods issue — sales | `GoodsIssuePosted` | `GI_COGS` | LIVE |
| Goods issue — consumption | `GoodsIssuePosted` | `CONSUMPTION_EXPENSE` / `GI_EXPENSE` | LIVE |
| Inventory adjustment up | `InventoryAdjustmentPosted` | `INVENTORY_GAIN` | LIVE |
| Inventory adjustment down | `InventoryAdjustmentPosted` | `INVENTORY_LOSS` | LIVE |
| Write-off / scrap | `InventoryAdjustmentPosted` | `INVENTORY_WRITEOFF` | LIVE |
| Supplier invoice variance | `SupplierInvoicePosted` | `PURCHASE_VARIANCE` / `PRICE_VARIANCE` | LIVE |

MM never posts inventory through FICO, and FICO never mutates stock. The bridge is one-way: MM → `mm_accounting_events` → FICO.

## 3. SD / POS integration (operational)

| Transaction | Keys | Status |
| --- | --- | --- |
| POS sale revenue | `SALES_REVENUE` | LIVE |
| POS output tax | `OUTPUT_TAX` | LIVE |
| POS tender / platform payout | `PAYMENT_CLEARING` | LIVE |
| Credit sale receivable | `CUSTOMER_RECON` | LIVE |
| POS void | exact reversal of the original journal | LIVE |
| Cost of sale | `GI_COGS` via the MM goods issue — **not** a second SD posting | LIVE |

Cost of goods sold is recognized exactly once, by the MM goods issue. SD does not post a parallel COGS entry.

## 4. Configuration-only domains

Keys exist, rules can be authored, validated and simulated. **No operational posting.**

| Domain | Keys | Blocking dependency |
| --- | --- | --- |
| AP supplier reconciliation | `SUPPLIER_RECON`, `SUPPLIER_INVOICE`, `INPUT_TAX` | AP module |
| Treasury cash/bank | `CASH_ON_HAND`, `BANK_ACCOUNT`, `PETTY_CASH`, `BANK_CLEARING`, `CASH_IN_TRANSIT`, `BANK_CHARGES`, `INTEREST_*`, `FX_*`, `CASH_OVERAGE`, `CASH_SHORTAGE` | Treasury settlement capability |
| Asset acquisition | `ASSET_ACQUISITION`, `ASSET_CLEARING`, `ASSET_UNDER_CONSTRUCTION` | Asset Accounting |
| Depreciation | `DEPRECIATION_EXPENSE`, `ACCUMULATED_DEPRECIATION`, `ASSET_IMPAIRMENT`, `ASSET_DISPOSAL_*` | Asset Accounting depreciation run |
| Production / CO | `RAW_MATERIAL_CONSUMPTION`, `WORK_IN_PROCESS`, `FINISHED_GOODS`, variance and overhead keys | PP/CO costing and settlement |

## 5. Idempotency and duplicate prevention

| Control | Mechanism |
| --- | --- |
| Event claim | `mm_accounting_events` status transition to `PROCESSING` with a stale-claim cutoff |
| Journal uniqueness | Unique `fico_journal_entries.idempotencyKey` |
| Payload drift | `financialFingerprint` comparison rejects a reused key with different financial content |
| Retry | Re-runs the same pipeline; a duplicate links the existing journal instead of posting again |
| Reversal | Stable `REVERSE:<journalId>` key; an existing reversal is returned, not re-posted |

## 6. Failure behaviour

A determination failure raises `FicoAccountingDeterminationException`:

- no journal header and no journal lines are created,
- the event keeps its payload and stays `PENDING` (retryable) until attempts are exhausted, then `FAILED`,
- `lastErrorCode = DETERMINATION` with a readable `lastError`,
- the exception surfaces in the workbench with the configuration link,
- after Finance fixes and activates configuration, an authorized retry posts through the same central engine.

Event status is owned by `FicoAccountingEventProcessorService`; the journal service no longer writes event status on failure.

## 7. Reversal after configuration change

`FicoJournalService.reverseEntry` copies the original lines with debit and credit swapped. Current determination rules are **not** consulted, so activating a new rule version never alters historical accounting.

## 8. Frontend surfaces

| Surface | Path |
| --- | --- |
| Account Determination Workbench | `/modules/fico/account-determination` |
| Legacy rules route (defaults to Rules tab) | `/modules/fico/account-determination-rules` |
| Accounting Events (monitor + retry) | `/modules/fico/accounting-events` |
| Automatic journal on sales documents | [AutomaticJournalSection.tsx](../src/modules/sd/components/AutomaticJournalSection.tsx) |