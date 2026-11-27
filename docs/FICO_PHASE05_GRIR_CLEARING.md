# FICO Phase 05 — GR/IR clearing and invoice verification

Phase 05 completes procurement clearing on top of existing MM three-way match and FICO AP posting.

## Ownership

| Concern | Owner |
| --- | --- |
| PO, GR, supplier invoice, match tolerances, exceptions | MM `ThreeWayMatchService` |
| GR/IR open-item subledger (`fico_grir_open_items`) | FICO `FicoGrIrOpenItemService` |
| Supplier invoice journal + AP open item (single post) | FICO `FicoAccountsPayableService.postMatchedSupplierInvoice` |
| GL GR/IR + inventory accrual on receipt | FICO automatic journal via `GoodsReceiptPosted` |

MM never posts G/L. Approved `SupplierInvoiceMatched` events route to AP only (no duplicate MM journal).

## GR posting (receipt)

- Dr Inventory · Cr GR/IR (`GR_IR` key) — unchanged Phase 04 path.
- Listener `FicoGrIrOpenItemListener` on `GoodsReceiptPosted` creates `FicoGrIrOpenItem` per procurement GR line.

## Invoice verification (MM)

- Quantity, price, tax, currency, supplier checks in `ThreeWayMatchService.evaluate`.
- Configurable tolerances via `MatchToleranceService`.
- Blocking exceptions prevent approval; `approve` emits accounting only when `MATCHED` or `PARTIALLY_MATCHED`.
- Partial invoicing updates PO line `invoicedQuantity`; GR/IR residual stays open until cleared.

## Matched supplier invoice (FICO)

Journal (one document, one AP liability):

1. Dr GR/IR — matched receipt value (from `MmSupplierInvoiceLineReceipt` allocations).
2. Dr input tax — recoverable per tax code.
3. Dr/Cr purchase variance — `PURCHASE_VARIANCE` when invoice net ≠ GR/IR cleared amount.
4. Cr AP reconciliation — supplier liability (`FicoApOpenItem`).
5. Cr withholding — when configured.

`FicoApGrIrAllocation` + `FicoGrIrOpenItem` updated atomically in `afterPersist`.

## Workbench

- API: `GET /fico/grir/workbench?companyId=…` (filters: supplier, PO, material, plant, status, aging, outstanding).
- Backfill: `POST /fico/grir/backfill?companyId=…` or `backfill=true` on workbench load.
- UI: `/modules/fico/grir-clearing`

Includes blocked invoices, invoice-before-receipt list, and G/L vs subledger reconciliation (`getGrIrReconciliation`).

## Tests

- `backend/src/fico/fico-grir-open-item.service.spec.ts` — allocation clearing.
- `backend/src/fico/fico-accounts-payable.service.spec.ts` — matched invoice atomic AP + GR/IR allocations.
- `backend/src/mm/three-way-match/three-way-match.spec.ts` — match + event emission.