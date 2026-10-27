# ISO 9001 Work Instruction — Outbound Flow (Picking, Packing, Goods Issue)

This document maps AGCTEK **MM-09 Warehouse Execution** and **MM-08 Goods Issue** to the ISO 9001–aligned outbound sequence. Physical stock decreases only through `InventoryPostingService` (`ISSUE` movement) when a goods issue is **posted** (step 4).

## Process overview

| Step | Activity | Role | System path | Control criteria |
| --- | --- | --- | --- | --- |
| 1 | Picking execution | Warehouse Picker | Picking → Pick waves | Pick list from warehouse **picking rules** / wave strategy; **scan & confirm** bin, material, batch/serial on `POST …/picking-tasks/:id/confirm`; pick wave must be **started** (not DRAFT) |
| 2 | Packing operations | Packer / Shipping Clerk | Packing workspace | Full scan before **Complete packing**; formal **packing list** (`PL-YYYYMMDD-#####`); **seal** with weight & L×W×H; labels/tracking before **Ready for dispatch** |
| 3 | GI verification & posting | Warehouse Supervisor | Goods Issue | Supervisor **verify** against SO/DO/production reference; **Post** only after verification (package-backed GI may auto-verify when package is READY with packing list) |
| 4 | Inventory & ledger decrease | Inventory Controller / System | Goods Issue post → Inventory Ledger | `ISSUE` transactions, balance update, valuation cost layers, FICO bridge event |

## End-to-end flow

```text
Reservation / SO demand
  → Pick wave (strategy from WmPickingRule)
  → WmPickingTask (scan & confirm)
  → WmPackage (scan pack, packing list, seal, READY_FOR_DISPATCH)
  → MmGoodsIssue DRAFT
  → Supervisor verify (or package auto-verify)
  → POST → InventoryPostingService (ISSUE)
  → MmInventoryTransaction + cost layers + MmAccountingEvent
```

## API controls (canonical)

| Action | Method | Path |
| --- | --- | --- |
| Confirm pick (scan) | POST | `/api/v1/mm/picking-tasks/:id/confirm` |
| Complete packing | POST | `/api/v1/mm/packages/:id/complete-packing` |
| Seal package | POST | `/api/v1/mm/packages/:id/seal` |
| Ready for dispatch | POST | `/api/v1/mm/packages/:id/ready-for-dispatch` |
| Create goods issue | POST | `/api/v1/mm/goods-issues` |
| Supervisor verify GI | POST | `/api/v1/mm/goods-issues/:id/verify-supervisor` |
| Post goods issue | POST | `/api/v1/mm/goods-issues/:id/post` |

## Records retained

- Pick waves, picking tasks, warehouse task scan audit
- Package items, scan logs, packing list number, seal measurements, label/tracking timestamps
- Goods issue header with supervisor verification fields
- Posted inventory transactions (immutable) and accounting events

## Related docs

- `docs/MM_ISO9001_FOUNDATION_WORK_INSTRUCTION.md` — master data prerequisites
- `docs/MM_TRANSACTION_RULES.md` — GI and negative stock rules
- `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md` — SD ↔ MM fulfillment pipeline
