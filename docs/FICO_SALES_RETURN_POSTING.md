# Customer Sales Return → FICO posting

## Event types

| Lifecycle | Event | Owner |
| --- | --- | --- |
| MM disposition RESTOCK | `CustomerReturnRestocked` (MmAccountingEvent v2) | MM |
| MM disposition SCRAP | existing `ScrapPosted` → `INVENTORY_SHRINKAGE` | MM |
| SD refund `PAID` | `ReturnRefundPaid` → durable `SdSalesReturnRefundPaid` | SD → FICO bridge |
| SD refund `APPROVED` (credit memo issued) | none — commercial journal waits for `PAID` | — |
| SD return `APPROVED` | none (MM intake only) | — |

## Transaction keys / accounts

| Journal | Key / resolution | Economics |
| --- | --- | --- |
| Inventory restock | MM key `SALES_RETURN` | Dr Inventory / Cr COGS at **valuation cost** (mirrors `GI_COGS`) |
| Scrap / loss | `INVENTORY_SHRINKAGE` | Dr Shrinkage / Cr Inventory |
| Refund commercial | SD company defaults (`SALES_REVENUE`, `OUTPUT_TAX`, cash/AR) | Dr Revenue (+ tax) / Cr Cash\|AR at **selling price** |

Document types: restock → `MM_ADJUSTMENT`; refund → `SD_REVERSAL` (FI `SR`).

Idempotency:

- Restock: `CustomerReturnRestocked:CUSTOMER_RETURN:{mmCustomerReturnId}`
- Refund: `sales-return-refund:{sdReturnRequestId}:{refundId}`

## Traceability (Phase 3)

| Surface | Behavior |
| --- | --- |
| Journal detail Source card | Links to Customer Returns (`?requestId=` when known); MM restock also shows SD return id from journal metadata |
| SD Customer Returns detail | Read-only Accounting panel: inventory + refund journals, lines, event status + `lastError` |
| CRM return case panel | Same read-only Accounting panel |
| FICO posting monitor | `CustomerReturnRestocked` under MM / `SdSalesReturnRefundPaid` under SD; FAILED shows `lastError` |
| LEGACY stubs | Filtered out of return accounting UI; monitor labels consumed-without-lines as legacy stub |

No post/reverse from SD UI — reverse only via existing FICO journal reverse (blocked for MM/SD automatic sources).

## Reseed AGCTEK mappings

```bash
cd backend
npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/seed-sales-return-mm-mapping.ts
```

Upserts the `SALES_RETURN` catalogue key (`integrationStatus: LIVE`) and one ACTIVE
mapping per active `GI_COGS` row (debit/credit reversed: Dr Inventory / Cr COGS).

AGCTEK starter COA example after reseed: debit `1200` (Inventory), credit `5000` (COGS).
