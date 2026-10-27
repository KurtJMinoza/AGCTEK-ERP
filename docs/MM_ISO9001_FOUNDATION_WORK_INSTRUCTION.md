# ISO 9001 Work Instruction — MM Foundation (Master Data Steps 1–4)

This document maps AGCTEK Materials Management **foundation master data** to the ISO 9001–aligned setup sequence. Operational posting (GR, GI, transfers, counts) must not proceed until these controls are satisfied for the company/warehouse scope in use.

## Process overview

| Step | Activity | Role | Primary UI | Control criteria |
| --- | --- | --- | --- | --- |
| 1 | Material master setup | Master Data Manager | Materials & SKUs | Material types, categories, UOM & conversions, barcodes, batch/serial flags, **standard costs** for active materials |
| 2 | Supplier master configuration | Procurement Data Steward | Supplier Master (+ materials, pricing, terms, documents) | At least one supplier with **supplier–material** links; pricing/terms/documents maintained per policy |
| 3 | Warehouse structure setup | Warehouse Manager | Storage types/sections/bins, **Putaway Rules**, **Picking Rules** | Bins with defined capacity; active putaway & picking rules per warehouse |
| 4 | Inventory & valuation configuration | Finance Controller | Inventory valuation, FIFO/MAP/standard, cost layers, landed cost | Active valuation profiles; inventory-managed materials have valuation method; **negative stock** only when explicitly allowed on material |

## Readiness dashboard

**Path:** `/modules/mm/foundation-setup`  
**API:** `GET /api/v1/mm/foundation/readiness`

Each step exposes metrics and a **Ready / Gap** flag derived from data in the database (not manual sign-off).

## Warehouse rules (step 3)

| Rule type | UI | API prefix |
| --- | --- | --- |
| Putaway | `/modules/mm/warehouse-management/putaway-rules` | `/api/v1/mm/warehouse-rules/putaway` |
| Picking | `/modules/mm/warehouse-management/picking-rules` | `/api/v1/mm/warehouse-rules/picking` |

Putaway execution resolves strategy via configured rules (fallback: capacity-based). Pick waves use the warehouse default picking strategy from active picking rules.

## Negative stock (step 4)

- Material field: `negativeStockAllowed` (Valuation tab on material master).
- `InventoryPostingService` blocks outbound quantity below available on-hand when the flag is **false** (see `docs/MM_TRANSACTION_RULES.md`).

## UI workflow strip

Pages for steps 1–4 and the foundation dashboard show **ISO 9001 work instruction — MM foundation** with deep links between steps and the readiness dashboard.

## Related docs

- `docs/MM_ISO9001_OUTBOUND_WORK_INSTRUCTION.md` — picking, packing, goods issue (operational outbound)
- `docs/MM_ISO9001_INVENTORY_CONTROL_WORK_INSTRUCTION.md` — MM-10 count/variance/adjustment (downstream of foundation)
- `docs/MM_ARCHITECTURE.md` — MM-01…MM-04 ownership
- `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md` — material, supplier, warehouse, valuation boundaries
