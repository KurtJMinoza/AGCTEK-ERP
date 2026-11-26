# FICO Phase 07 — Accounts Receivable

## Database (Prisma)

- `FicoCustomerCompanyAccount` — company-scoped customer financial master (recon account, terms, credit limit).
- `FicoArCreditProfile` — exposure/limit snapshots (recalculated from open items).
- `FicoArDocument` / `FicoArDocumentLine` — immutable AR source documents.
- `FicoArOpenItem` — authoritative aging and allocation balances.
- `FicoArPayment` / `FicoArPaymentAllocation` — collections (incl. unallocated remainder).
- `FicoArClearing` / `FicoArClearingLine` — credit/advance netting (schema ready; API parity with AP clearing planned next).
- `FicoJournalEntry.customerId` — partner link for AR journals.

Migration: `backend/prisma/migrations/20261130120000_fico_phase07_accounts_receivable/`.

## SD / POS integration

| Event | Behavior |
| --- | --- |
| `PosSaleCompleted` | If `outstandingBalance > 0`: revenue journal + AR document/open item for outstanding only. If zero: existing journal-only path (no stray receivable). |
| `PosCollectionCompleted` | Collection journal + payment allocations; over-collection → `UNAPPLIED_RECEIPT` open item. |
| `SdSalesInvoicePosted` | Issued unpaid `SdSalesInvoice` → Dr AR / Cr revenue + document lines + open item (`FicoArSalesInvoiceListener` on POD issue). |

## API (`/api/v1/fico/accounts-receivable`)

- `GET dashboard`, `open-items`, `reconciliation`
- `POST collections`, `documents` (credit/debit memo, advance, write-off)
- `PUT customer-accounts/:customerId`

Permission: `fico.accounts-receivable`.

## UI

`/modules/fico/accounts-receivable` — overview KPIs, open items, reconciliation (ECME workbench expansion follows AP patterns).

## Follow-ups

- AR clearing UI/API, statements, collection proposals, SD credit-check hook on order capture, reversal symmetry, full tax lines on SD invoice posting, historical as-of aging.