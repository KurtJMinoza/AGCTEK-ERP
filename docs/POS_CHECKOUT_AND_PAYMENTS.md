# Retail POS — Checkout and Payment Management

Scope: the retail point of sale in AGCTEK. This document describes the staged
checkout, the tender model and the cashier shift. It follows
`docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md` (ownership) and does not override it.

## 1. Ownership

| Concern | Owner |
| --- | --- |
| The sale document (SD sales order, channel `POS`) | SD |
| Tender records (one row per payment method) | SD |
| Cashier shift / register session | SD |
| Held (suspended) sales | SD |
| Stock movement of the sale | MM (`GoodsIssueService` → `InventoryPostingService`) |
| Product tax classification and rate | MM Material Master + FICO Tax Code |
| General ledger posting of the sale | FICO |

SD never writes inventory balances directly and never computes ATP; it consumes
the MM services. FICO never owns tender capture.

## 2. Stages

```text
1. SHIFT      open register → opening float, cashier, branch, terminal
2. CART       scan / search → cart lines (live ATP from MM)
3. SUMMARY    subtotal, transaction discount, tax (from MM tax configuration)
4. TENDER     one or more payment methods, validated, split allowed
5. COMPLETE   sales order + tenders + MM goods issue + shift collections + receipt
6. RECEIPT    print / reprint, then the register is clean for the next customer
```

Steps 2–4 happen in the terminal; step 5 happens on the server as one
completion call. Nothing is completed while the tender screen is open.

## 3. Tender methods

| Method | Required fields | Settlement | Verification |
| --- | --- | --- | --- |
| `CASH` | amount, amount handed over | `Paid` | `VERIFIED` (change = handed over − amount) |
| `GCASH` | amount, reference number | `Paid` when the cashier confirms, else `Pending Verification` | `VERIFIED` / `PENDING` |
| `BANK_TRANSFER` | amount, reference, bank name, transaction date | `Paid` when confirmed, else `Pending Verification` | `VERIFIED` / `PENDING` |
| `CARD` | amount, card transaction reference | `Paid` | `VERIFIED` |
| `CHEQUE` | amount, cheque number | `Pending Verification` (clearing) | `PENDING` |
| `SALARY_LOAN` | amount, employee number, optional payroll reference | `Authorized` (receivable, not cash) | `RECEIVABLE` |

A manually entered reference is never proof of settlement: without the
cashier confirmation the tender stays pending. A salary deduction is a credit
sale — the customer's credit limit is checked before the sale and consumed
after it; it is never counted as cash in the drawer.

Split payment is supported (`paymentMode: SPLIT`): a sale carries one tender
row per payment method (Cash + GCash, Cash + Card, …). The cashier enters each
payment amount; the UI shows covered vs remaining balance. Checkout rejects a
split with fewer than two tenders, and the order is marked `Paid` only when the
tenders fully cover the amount due and every tender has settled. Only cash may
hand over more than the amount it covers; the surplus is the change.

### Charge sale (pay later)

`paymentMode: CHARGE` lets an identified customer take the goods now and pay
later. It takes **no tenders**: the whole total becomes an open `SdPosReceivable`
(balance = total), while the goods issue runs through the same MM engine as any
other sale (stock leaves immediately).

| Aspect | Rule |
| --- | --- |
| Request | `paymentMode: 'CHARGE'`, `dueDate` (required, `YYYY-MM-DD`, not before today in Manila time), `tenders` omitted/empty |
| Customer | Must be identified (walk-in is rejected). `CREDIT` accounts: `creditLimit − open receivables` must cover the total. Other accounts have no limit |
| Order | `paymentMethod = 'CHARGE'`, `paymentStatus = 'Unpaid'`, `outstandingBalance = total`, `dueDate`; no down payment fields |
| Paying later | Existing collections (`PosCollectionService.collect`, **Collect** in POS transactions) — in full or in parts (e.g. a down payment tomorrow). Status moves `Unpaid → Partially Paid → Paid`; `paymentMethod` stays `CHARGE` |
| Receipt | `paymentMode: 'CHARGE'`; shows "Charged (pay later)", balance due, due date and a customer acknowledgement line |
| FICO | Unchanged: the `PosSaleCompleted` event carries `outstandingBalance`, so Accounts Receivable is debited for the unpaid part |

Reporting: the Sales Orders list/detail show the method as *Charge*, the balance
and the due date (flagged **Overdue** once the due day, in Manila time, has
ended). The Sales Analysis detailed line report (and its Excel export) adds
sales type `CHARGE`, paid status `Unpaid` while nothing is collected, and the
`Due date` / `Overdue` columns. A charge sale is only valid through staged
checkout (`deferCompletion`), so a failed goods issue can be resumed without
losing the receivable.

Known limitation: the credit check and receivable creation are not locked
against each other, so two simultaneous charge sales for the same CREDIT
customer could together exceed the limit by one sale.

## 4. Completion, idempotency and safety

`POST /api/v1/sd/pos/checkout` performs, in order:

1. **Shift check** — the cashier shift must be open.
2. **Idempotency** — `idempotencyKey` is unique on the sales order; a repeated
   call returns the sale that exists and posts nothing again.
3. **Price and totals** — the SD sales order verifies catalogue prices, the
   cart total and the ATP before the order exists.
4. **Tax** — per line from the MM tax configuration (VATable / VAT Exempt /
   Zero-Rated, FICO rate, VAT inclusive or exclusive).
5. **Tenders** — one payment row per method, each with its own idempotency key.
6. **Inventory** — one MM goods issue (`issuePurpose: SALES`,
   `sourceDocumentType: SALES_ORDER`) that consumes the reservation taken at
   confirmation and takes the stock out of the bins that hold it.
7. **Order** — the sale becomes `COMPLETED`, gets its receipt number, its
   cashier and its shift.
8. **Event** — `PosSaleCompleted` is written to the SD outbox; FICO owns the
   resulting ledger posting.

If the stock posting fails, the sale stays `CONFIRMED` with its tenders
recorded: the money is captured, the stock is not, and the cashier can retry
the completion. The sale is never marked complete without the goods issue.

## 5. Cashier shift

A shift (`SdPosSession`) holds the branch, the register, the cashier, the
opening float and the closing reconciliation. Collections are derived from the
tender rows of the shift, so the tender row is the single source of truth for
the money. At close the counted cash is compared with the expected cash
(opening float + cash tenders − change); the difference is the variance.

## 6. Held sales

`POST /api/v1/sd/pos/holds` parks the cart while another customer is served;
`resume` returns it to the terminal, `discard` drops it. A held sale is a
snapshot owned by SD, not a sales order.

## 7. Not yet built (next phases)

- **FICO ledger posting of the sale.** The `PosSaleCompleted` event is emitted
  and carries the tenders, but no journal is created yet: FICO needs the
  clearing accounts (e-wallet, bank), the sales discount account and the tax
  output mapping before a balanced entry can be posted. The plan is a FICO
  listener that builds a DRAFT journal entry (cash / clearing / receivable
  debit, sales revenue and tax output credit) and refuses to post when the
  accounts are not configured.
- **Item-level discounts and discount authorization.** Today only a
  transaction-level discount exists; there is no supervisor approval flow.
- **Refunds, exchanges and receipts reprint** as a POS flow: the SD return
  request and sales return services own them, but the terminal has no screen
  for them yet.
- **Cash in / cash out** register movements.
- **Offline handling** (queue and synchronisation of terminal submissions).
- **Payroll deduction ledger**: the salary deduction books the receivable on
  the customer credit account; the payroll period deduction is not modelled.
