# FICO Account Determination — Transaction Key Catalogue

Transaction keys name an **accounting purpose**, never a G/L account code.

- Source of truth: [backend/src/fico/fico-transaction-key.catalog.ts](../backend/src/fico/fico-transaction-key.catalog.ts)
- Persisted copy: `fico_transaction_keys` (synced, never purged)
- API: `GET /api/v1/fico/account-determination/transaction-keys`
- Sync: `POST /api/v1/fico/account-determination/transaction-keys/sync`

## Integration status

| Status | Meaning |
| --- | --- |
| `LIVE` | An operational module resolves this key during automatic posting today |
| `CONFIG_ONLY` | Rules can be configured, validated and simulated; no module posts it yet |
| `NOT_AVAILABLE` | Reserved; not selectable |

**A `CONFIG_ONLY` key with an active rule is not an operational integration.**

## Catalogue entry fields

| Field | Use |
| --- | --- |
| `code` | Stable contract value (e.g. `GI_COGS`) |
| `owningModule` | Module that owns the accounting purpose |
| `accountingCategory` | Drives permitted G/L account types (see below) |
| `supportedSourceModules` | Modules allowed to request this key |
| `requiresValuationClass` | Resolution fails without a valuation class |
| `inventorySide` | Inventory debit/credit role, or `NONE` |
| `automaticPostingEligible` | May be resolved by automatic posting |
| `systemDefined` | Semantics live in code; API may only change status/sort/description |
| `legacyAliases` | Older MM codes that map to this key |

## Accounting category → permitted G/L account types

From `FICO_ACCOUNTING_CATEGORY_GL_TYPES` in [fico-account-determination-policy.ts](../backend/src/fico/fico-account-determination-policy.ts). Checks use master-data account types, never code patterns.

| Category | Permitted account types |
| --- | --- |
| `INVENTORY` | ASSET |
| `CLEARING` | ASSET, LIABILITY |
| `VARIANCE` | EXPENSE, ASSET, LIABILITY |
| `REVENUE` | REVENUE |
| `COGS` | EXPENSE |
| `TAX` | ASSET, LIABILITY |
| `CASH` | ASSET |
| `RECEIVABLE` | ASSET |
| `PAYABLE` | LIABILITY |
| `TREASURY` | ASSET, LIABILITY |
| `EQUITY` | EQUITY |
| `ASSET` | ASSET |

## Keys by domain

### MM inventory (LIVE unless noted)
`INVENTORY` (CONFIG_ONLY) · `GR_IR` · `PURCHASE_VARIANCE` · `PRICE_VARIANCE` (legacy) ·
`INVENTORY_GAIN` · `INVENTORY_INCREASE_ADJ` (legacy) · `INVENTORY_LOSS` ·
`INVENTORY_SHRINKAGE` (legacy) · `INVENTORY_WRITEOFF` · `CONSUMPTION_EXPENSE` ·
`GI_EXPENSE` (legacy) · `GI_COGS` · `LANDED_COST` · `FREIGHT_CLEARING` (CONFIG_ONLY)

### SD / POS
`SALES_REVENUE` (LIVE) · `OUTPUT_TAX` (LIVE) · `PAYMENT_CLEARING` (LIVE) ·
`CUSTOMER_RECON` (LIVE) · `COGS` (CONFIG_ONLY)

### AP / Tax
`SUPPLIER_RECON` · `SUPPLIER_INVOICE` (legacy) · `INPUT_TAX` — all CONFIG_ONLY

### Treasury — Phase 04.16 (all CONFIG_ONLY)
`CASH_ON_HAND` · `BANK_ACCOUNT` · `PETTY_CASH` · `BANK_CLEARING` · `CASH_IN_TRANSIT` ·
`BANK_CHARGES` · `INTEREST_INCOME` · `INTEREST_EXPENSE` · `FX_GAIN` · `FX_LOSS` ·
`CASH_OVERAGE` · `CASH_SHORTAGE`

Payment-method guidance: [fico-treasury-payment-determination.policy.ts](../backend/src/fico/fico-treasury-payment-determination.policy.ts).
Electronic payments are **not** treated as immediate bank deposits, and a bank
G/L account is never shared across companies.

### Asset Accounting — Phase 04.17–04.18 (all CONFIG_ONLY)
`ASSET_ACQUISITION` · `ASSET_CLEARING` · `ASSET_UNDER_CONSTRUCTION` ·
`DEPRECIATION_EXPENSE` · `ACCUMULATED_DEPRECIATION` · `ASSET_IMPAIRMENT` ·
`ASSET_DISPOSAL_GAIN` · `ASSET_DISPOSAL_LOSS`

Capitalization eligibility and depreciation amounts belong to Asset Accounting, not to determination.

### PP / CO — Phase 04.19 (all CONFIG_ONLY)
`RAW_MATERIAL_CONSUMPTION` · `WORK_IN_PROCESS` · `FINISHED_GOODS` ·
`PRODUCTION_VARIANCE` · `MATERIAL_USAGE_VARIANCE` · `PRODUCTION_PRICE_VARIANCE` ·
`OVERHEAD_ABSORPTION` · `PRODUCTION_SCRAP`

### FICO
`RETAINED_EARNINGS` (CONFIG_ONLY, not automatic-posting eligible)

## Custom keys

`POST /transaction-keys` creates a non-system key (`systemDefined = false`).
`PATCH /transaction-keys/:id` on a **system-defined** key rejects changes to
`code`, `owningModule`, `accountingCategory`, `supportedSourceModules`,
`requiresValuationClass`, `inventorySide` and `automaticPostingEligible`.
Both operations write a `DETERMINATION_TRANSACTION_KEY_*` audit record.