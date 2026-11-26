# FICO Phase 08 — SD / POS Accounting Integration

## Ownership boundaries

| Concern | Owner |
| --- | --- |
| Revenue, tax, AR, collections | SD events → `FicoSdAccountingBridgeService` → `FicoAccountsReceivableService` / `FicoJournalService` |
| COGS / inventory cost | MM goods issue only (`GoodsIssuePosted`) |
| Customer credit exposure | `FicoArCreditCheckService` + `FicoArCreditProfile` |
| Billing milestone | `SalesInvoiceService.issueForSalesOrder` (POD) for non-POS channels |

POS channel never issues SD sales invoices for financial recognition (see `SdFulfillmentEventsListener`).

## Event matrix

| Event | Financial effect |
| --- | --- |
| `PosSaleCompleted` | Settlement debits (cash/card/wallet) + revenue + output tax; AR open item when `outstandingBalance > 0` |
| `PosCollectionCompleted` | Collection journal + AR allocations (overpay → unapplied receipt) |
| `SdSalesInvoicePosted` | AR invoice journal + open item (guarded against duplicate POS revenue) |
| `SalesInvoicePaid` | `SdCustomerCollection` — clears AR without duplicate revenue |
| `PosSaleRefunded` | Partial refund reversal journal (revenue/tax/settlement credits) |
| `PosSaleVoided` | Full reversal of posted revenue journal |

## Duplicate revenue prevention

`FicoSdRevenueGuardService` blocks `SdSalesInvoicePosted` when:

- Sales order channel is `POS`, or
- A posted `SD_REVENUE` journal already exists for the order (`pos-revenue:{salesOrderId}`).

## Credit checking

- SD order `confirm()` for `CREDIT` customers (unpaid) calls `FicoArCreditCheckService`.
- POS charge sales call the same service after local exposure checks.

## UI visibility

`GET /sd/sales-orders/:id/accounting` returns:

- Revenue/collection journals
- `inventoryJournals` (MM COGS / GI)
- `arDocuments` with journal links
- Accounting event status (`mm_accounting_events`)

## Customer deposit (POS)

`POST /sd/pos/deposits` records a standalone deposit (no sale lines, no revenue).

- Event: `PosCustomerDepositCompleted`
- Posting: settlement debits (net of merchant fees) + credit `CUSTOMER_ADVANCE`
- AR: `ADVANCE` document + open item (credit direction)

## Sales return (credit, no physical return)

When a return is settled as `CREDIT_NO_RETURN`, SD emits `SalesReturnCreditAuthorized` → `SdSalesReturnCreditMemo`:

- Debit sales return / adjustment account
- Credit customer receivable
- AR credit memo + open item (no MM intake)

## Merchant fees

`sd_payment_methods.merchantFeeRate` and `merchantFeeFlat` split each card/e-wallet tender into:

- Net settlement debit (clearing account)
- `BANK_CHARGES` debit for the fee portion

Configured per payment method; cash is typically zero.

## Acceptance mapping

- Cash sales: tender **applied** amounts only (change excluded) via `pos-tender.ts`.
- COGS once: MM GI journals only; SD snapshot surfaces them separately from revenue.
- No duplicate revenue: POS at register; ecommerce at invoice issue (paid-at-door skips AR issue event).