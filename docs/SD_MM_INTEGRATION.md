# SD ↔ MM integration (implementation map)

**Contract:** `AGENTS.md` §4 · **E2E:** `MASTER_E2E_SALES_ORDER_SCENARIO.md`

## Unified pipeline

```text
STANDARD | POS | ECOMMERCE
  → SdSalesOrder (+ lines)
  → SdMmPipelineService.enrichOrderForMmIntegration
       → MaterialResolutionService (SdProductMaterialAssignment)
       → UomConversionsService.toBaseUom (MM authority)
       → FulfillmentDeterminationService (warehouse)
       → SdFulfillmentService (SD fulfillment headers/lines)
  → SdEventEmitter SalesOrderConfirmed
  → SdDemandListener → SdIntegrationService → MM reservation + MmDemandSync
  → SdMmEventConsumer ← MM integration events
```

## Key API

| Endpoint | Purpose |
| --- | --- |
| `POST /sd/product-material-assignments` | Map product → material |
| `GET /sd/product-material-assignments/by-product/:id` | List mappings |
| `GET /sd/products/:id/availability` | Commercial ATP facade |
| `POST /sd/sales-orders/:id/confirm` | STANDARD (uses pipeline) |
| Retail create | `createRetail` → pipeline |

## Admin setup

Demo SD/MM seeds are **disabled** — use the UI (or `npm run prisma:seed-sd-purge` / `prisma:seed-mm-purge` only to clear old demo rows).

1. Create `SdProduct` (`productType`: `STOCK_ITEM` for inventory SKUs).
2. Create `SdProductMaterialAssignment` (company + material + optional division/UOM).
3. Optional: `SdBranchFulfillment` row (`branchCode` → `warehouseId`) for POS/e-commerce stores.

Historical orders without mapping remain readable; new stock orders require mapping before MM fulfillment.
