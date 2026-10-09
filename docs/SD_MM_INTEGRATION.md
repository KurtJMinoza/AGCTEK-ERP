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

## Returns (storefront → MM disposition)

```text
Customer (signed in, delivered order only)
  → POST /sd/sales-orders/retail/:id/returns     (bearer; ownership + company server-side)
  → SdReturnRequest (REQUESTED) + lines (disposition defaulted: damaged → QUALITY_HOLD)
  → POST /sd/returns/:id/approve                 (admin; company-scoped)
       → MmCustomerReturn (DRAFT, sdReturnRequestRef link)
  → MM returns intake → inspection → disposition (RESTOCK posts return receipt;
       QUALITY_HOLD/BLOCK → hold/damaged/scrap/disposal; REFUND_ONLY → refund)
```

| Endpoint | Purpose |
| --- | --- |
| `POST /sd/sales-orders/retail/:id/returns` | Customer return request (signed-in, own order, delivered only) |
| `GET /sd/returns?companyId=` | Company-scoped return request list |
| `POST /sd/returns` | Back-office return request create |
| `POST /sd/returns/:id/approve` | Admin approve → creates linked `MmCustomerReturn` |
| `POST /sd/returns/photos` | Multipart evidence photo (`{ imageUrl }`, reuses product image storage) |

Rules: one open (REQUESTED) request per order (damaged/defective lines never auto-restock; disposition is decided in MM inspection). Refund-only requests skip stock movement — the MM return has no lines to post.

## Admin setup

Demo SD/MM seeds are **disabled** — use the UI (or `npm run prisma:seed-sd-purge` / `prisma:seed-mm-purge` only to clear old demo rows).

1. Create `SdProduct` (`productType`: `STOCK_ITEM` for inventory SKUs).
2. Create `SdProductMaterialAssignment` (company + material + optional division/UOM).
3. Optional: `SdBranchFulfillment` row (`branchCode` → `warehouseId`) for POS/e-commerce stores.

Historical orders without mapping remain readable; new stock orders require mapping before MM fulfillment.
