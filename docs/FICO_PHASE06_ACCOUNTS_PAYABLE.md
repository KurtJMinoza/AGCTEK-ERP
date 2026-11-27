# FICO Phase 06 — Enterprise Accounts Payable

## Scope delivered in this increment

Extends the existing AP engine (`FicoAccountsPayableService`) and `/modules/fico/accounts-payable` UI without duplicating MM supplier master or parallel liability posting.

### Backend

| Capability | Owner | Notes |
| --- | --- | --- |
| PO-matched supplier invoices | Existing `postMatchedSupplierInvoice` | MM three-way match → journal + open item + GR/IR allocation |
| Non-PO & expense invoices | `POST /fico/accounts-payable/supplier-invoices` | `EXPENSE_INVOICE` / `NON_PO_INVOICE` → Dr expense (`AP_ADJUSTMENT`), tax, Cr AP |
| Credit memos, debits, advances | `POST /fico/accounts-payable/documents` | Unchanged central `postStandaloneApDocument` path |
| Payments & clearings | Existing | Idempotent journals; locked open items; multi-allocation |
| Duplicate supplier invoice # | `assertUniqueSupplierInvoiceReference` | Company + supplier + number across AP and MM |
| Dashboard | `GET /fico/accounts-payable/dashboard` | Live outstanding, overdue, period payments, blocks, aging buckets, MM posting exceptions |
| Payment proposals | `GET /fico/accounts-payable/payment-proposals` | Grouped open liabilities (proposal only — payment still posts via `POST …/payments`) |
| Aging / reconciliation / statements | Existing GET routes | Wired to UI |

### Frontend

- AP workbench tabs: Overview, Invoices (register), Open items, Payment proposals, Payments, Clearings, Aging, Reconciliation, Statements, All documents, Credits & advances.
- Header KPIs fed from dashboard API (not hardcoded).
- **New adjustment / invoice** dialog: credit memo, debit adjustment, advance, expense/non-PO invoice.
- Payment proposal → payment dialog pre-fill.

### Posting matrix (F. summary)

| Event | Debit | Credit |
| --- | --- | --- |
| Matched MM invoice | GR/IR, input tax, PPV | AP (+ withholding) |
| Expense / non-PO invoice | Expense, input tax | AP (+ withholding) |
| Payment | AP | Bank |
| Advance | Supplier advances | Bank |
| Clearing | AP / advances (net) | AP liabilities |
| Credit memo | AP | Offset (invoice key) |

Pure allocation of posted items does not create extra journals (clearing/payment engines only).

## Gaps / follow-up

- MM UI for supplier company accounting (`FicoSupplierCompanyAccount`) — API exists; dedicated FICO master screen optional.
- Attachments, approval workflow UI, batch payment export, withholding/discount lines on payments.
- Supplier picker on AP dialogs (currently supplier id field).
- Historical-as-of aging snapshots (current aging uses live open items with as-of due math).

## Validation

```bash
cd backend && npm run build
cd backend && npx jest src/fico/fico-accounts-payable.service.spec.ts
```

Apply any pending Prisma migrations before exercising direct invoices (no new migration in this increment — document types are string fields).