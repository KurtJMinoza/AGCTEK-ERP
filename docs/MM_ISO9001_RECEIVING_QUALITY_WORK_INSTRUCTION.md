# ISO 9001-Aligned Work Instruction — Receiving, Inspection, Quarantine & Supplier Return

This document maps AGCTEK **MM-07 Receiving / Quality** and **MM-08 inventory posting** to an ISO 9001–aligned control sequence. It describes **system controls and records**; it does **not** certify the organization or software as ISO 9001 certified.

## Central rule

Materials are **not** sellable merely because they physically arrived. Stock in **Quality Inspection** or **Blocked** status is excluded from available quantity until an authorized usage decision and posting through `InventoryPostingService`.

## Process map

```text
Approved PO → ASN / Expected Receipt → Goods Receipt (Draft → Submitted → Verified → Posted)
  → [No inspection] Putaway → Unrestricted
  → [Inspection required] QI stock → Inspection lot → Results → Usage decision
       → Pass → Unrestricted + putaway
       → Partial pass → Accepted unrestricted + rejected blocked/quarantine
       → Fail → Blocked + quality hold + NC → Supplier return → Return GI → Financial event
```

## Goods Receipt (Receiving Clerk)

| Control | Implementation |
| --- | --- |
| No stock change before post | Status must reach **VERIFIED** before `POST /mm/goods-receipts/:id/post` |
| Submit / verify | `POST …/submit`, `POST …/verify` + `mm_goods_receipt_audits` |
| Damaged at receipt | Line `damagedQuantity` posts to **BLOCKED**; variance + quality hold on post |
| Inspection path | Rule engine → QI stock + `InspectionLotService.createFromGoodsReceipt` |
| Ledger | `InventoryPostingService` RECEIPT / TRANSFER only |

## Quality (QA Inspector)

- Inspection lots: `/api/v1/mm/inspection-lots`
- Usage decision: `POST …/usage-decision`
- Partial pass: `POST …/partial-usage-decision` (accepted + rejected split)
- Holds: `/api/v1/mm/quality-holds`

## Variances

- Receiving workbench variances (expected receipt path) unchanged
- Direct GR variances: `mm_receiving_variances.goodsReceiptId` with `VAR-YYYYMMDD-#####`

## Supplier return

- `SupplierReturnService` — draft → approve → post return GI (blocked stock reduction)
- Financial bridge: `MmDomainEventsService` / accounting events (no GL from controllers)

## Permissions

Server-side `@MmMutation` / `@MmRead` on all routes; role matrix in `permissions.constants.ts` under `receiving`, `returns-disposal`, `inventory-management`.

## Related docs

- `docs/MM_QUALITY_ARCHITECTURE.md`
- `docs/MM_TRANSACTION_RULES.md`
- `docs/MM_ISO9001_OUTBOUND_WORK_INSTRUCTION.md`
