# FICO Phase 09 — Cash, bank, and centralized tax accounting

## Scope

- **Treasury master**: `FicoTreasuryAccount` (bank, cash, branch cash, cashier settlement, card/e-wallet clearing). No payment credentials; optional masked account number only.
- **Payment resolution**: `FicoTreasuryPaymentResolutionService` — company, branch, payment method, currency, treasury account, provider; falls back to payment-method G/L then account determination (no hardcoded G/L).
- **Settlements**: `FicoTreasurySettlementService` — internal transfers, cash deposit/withdrawal, card/e-wallet settlement with merchant fees, incoming/outgoing clearing; all journals via `FicoJournalService.postAutomaticJournal`.
- **Bank import**: `FicoTreasuryBankStatementLine` import (reconciliation UI lists unmatched lines).
- **Tax snapshots**: `FicoTaxPostingSnapshot` written on SD revenue-related accounting events (immutable amounts at posting time).
- **Tax reconciliation**: snapshot totals vs tax-code-linked G/L movement.

## API (`/api/v1/fico/treasury`)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/accounts` | `fico.treasury` read |
| POST | `/accounts` | create |
| PUT | `/accounts/:id` | update |
| GET | `/settlements` | read |
| POST | `/settlements` | create |
| POST | `/bank-statements/import` | create |
| GET | `/bank-statements` | read |
| GET | `/payment-resolution` | read |
| GET | `/tax-reconciliation` | read |

## Integration

- **SD/POS posting**: `FicoSdPostingService.resolvePaymentClearingAccount` delegates to treasury payment resolution.
- **AR collections**: manual collections resolve settlement G/L via the same service.
- **Accounting processor**: after a journal is linked, `FicoTaxPostingSnapshotService.captureFromDispatch` persists tax snapshots where order lines carry tax.

## UI

- `/modules/fico/treasury`
- `/modules/fico/tax-reconciliation`

## Migration

`backend/prisma/migrations/20261130140000_fico_phase09_treasury_tax/`

## Acceptance notes

- Statutory tax **filing** compliance is out of scope unless reporting outputs are independently validated.
- Historical tax on posted documents remains in snapshots when tax codes or rates change later.