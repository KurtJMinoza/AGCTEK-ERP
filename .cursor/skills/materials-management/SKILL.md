---
name: materials-management
description: >-
  Materials Management (MM) ERP engineering contract for this codebase.
  Use before designing, implementing, modifying, debugging, or reviewing any MM
  work: material master, suppliers, MRP/planning, purchase requisitions, RFQ,
  quotations, purchase orders, receiving, goods receipt/issue, inventory ledger,
  balances, reservations, warehouse (bins/putaway/picking/packing), transfers,
  adjustments, cycle count, valuation, returns/disposal, barcodes, or MM reports.
  Enforces inventory-ledger-centric architecture and forbids disconnected CRUD.
---

# Materials Management (MM) — ERP Engineering Skill

## PURPOSE

You are the Materials Management (MM) engineering specialist for this ERP.

Design, implement, modify, debug, and review all MM functionality while
preserving the established enterprise ERP architecture.

MM owns the complete material lifecycle:

```text
Demand → Planning → Procurement → Receiving → Inventory → Warehouse
→ Reservation → Picking → Packing → Goods Issue → Valuation
→ Returns / Disposal → Replenishment
```

MM must operate as an **integrated ERP domain**, not disconnected CRUD.

For the full architectural contract (sections 1–62), read
[reference.md](reference.md) before non-trivial MM work.

For **MM-01 → MM-15 dependency order**, document ownership, and update authority, read
[docs/MM_DEPENDENCY_MAP.md](../../docs/MM_DEPENDENCY_MAP.md).

Also respect project UI/module rules: `AGENTS.md`, `.cursor/rules/erp-ui.mdc`,
`.cursor/rules/erp-modules.mdc`.

---

## This repo’s MM layout

| Layer | Path |
| --- | --- |
| Backend domain | `backend/src/mm/` |
| Prisma models | `backend/prisma/schema.prisma` (`Mm*`, `Wm*`) |
| Frontend modules | `src/modules/mm/` |
| Thin routes | `src/app/(protected-pages)/modules/mm/` |
| Nav | `src/configs/erp-modules/mm.module.ts` |

Reuse existing services (especially `InventoryPostingService`) before adding new ones.

---

## Non-negotiable core

### Inventory ledger is the MM core

Never implement inventory as editable stock quantities.

```text
Business Operation
→ Inventory Posting Service
→ Immutable Inventory Transaction
→ Inventory Balance
→ Audit Event
→ Domain Event
→ Accounting Event (when financially relevant)
```

Canonical inbound posting chain (keep exactly):

```text
Receiving
→ Goods Receipt
→ Inventory Posting Service
→ Inventory Ledger
```

Do **not** let Receiving, Warehouse, Goods Receipt, and Stock Movements each
maintain their own stock logic.

### Posted transactions are immutable

- Never `UPDATE` a posted inventory transaction
- Corrections = **reversal** transaction referencing the original

### Availability ≠ on hand

```text
Available ≈ On Hand − Unavailable/Restricted − Reserved
```

- Reservation allocates; it does **not** create a physical stock movement
- Goods Issue **does** reduce on-hand

### Stock status (minimum)

`UNRESTRICTED` | `QUALITY_INSPECTION` | `BLOCKED`

Validate status transitions; QI/Blocked are not freely available.

### Material / batch / serial / UOM

- Transactions reference `materialId` (no free-text material identity)
- Batch-controlled materials require batch on receive/issue/transfer/adjust
- Serialized materials require unique serials; no anonymous issue
- Normalize to base UOM for inventory; preserve transaction UOM for audit

### Warehouse hierarchy

```text
Company → Plant → Warehouse → Storage Type → Storage Section → Storage Bin
```

Use FKs (`warehouseId`, `storageBinId`, …), not bin strings as primary keys.

### MM vs other domains

| MM owns | MM does NOT own |
| --- | --- |
| Material master, procurement docs, physical inventory, availability, reservations, warehouse execution, valuation, returns/disposal, MRP suggestions | GL, AP payment execution, AR, payroll, CRM, fleet, customer billing |

Integration pattern:

```text
MM Transaction → Accounting Event → FICO Posting Engine → Accounting Document
```

Never post directly to the General Ledger from MM.

---

## Process model (think processes, not pages)

**Procurement:** Demand → PR → Approval → RFQ → Quotation → Comparison → PO  
**Inbound:** PO/ASN → Receiving → Verify → QI → GR → Putaway → Available  
**Outbound:** Requirement → Availability → Reservation → Pick → Pack → GI  
**Control:** Count → Blind count → Variance → Recount → Approval → Adjustment → Ledger  
**Replenishment:** Demand → MRP → Net requirement → Suggestion → PR (not auto-PO unless configured)

Preserve **document flow** both directions (PR→RFQ→Quote→PO→GR→…→Accounting).

Prefer separate status dimensions when needed:

`Document` / `Approval` / `Fulfillment` / `Inventory` / `Accounting`

---

## Ownership & anti-duplication

One authoritative owner per transaction. Examples:

| Document | Owner |
| --- | --- |
| PR / RFQ / Quotation / PO | Procurement |
| Goods Receipt / Issue / Adjustment / Ledger | Inventory |
| Putaway / Picking / Packing | Warehouse |
| Cycle count | Inventory Control |
| Supplier return | Returns & Disposal |

Before creating anything new: check existing schema, services, routes, and UI.
Do **not** create a second Goods Receipt, second availability calculator, or
duplicate stock math in SD/Warehouse/UI.

---

## Implementation workflow (every MM task)

1. **Inspect** — schema, `backend/src/mm/*`, shared posting/availability, workflow, audit, UI, routes, nav
2. **Ownership** — domain owner, source/target docs, inventory/valuation/accounting/audit impact
3. **Data model** — entities, FKs, indexes, statuses, source refs
4. **Domain logic** — services only; thin controllers
5. **API** — existing Nest/Prisma conventions under `/api/v1/mm/...`
6. **UI** — ECME + `src/components/shared`; module pages under `src/modules/mm/`; thin app routes
7. **Auth** — granular permissions + company/plant/warehouse scope (backend mandatory)
8. **Audit** — CREATE/UPDATE/SUBMIT/APPROVE/POST/REVERSE/RECEIVE/ISSUE/…
9. **Events** — domain + accounting events when relevant
10. **Test** — success and failure paths (insufficient stock, already posted, etc.)

Prefer incremental correction over rewrite.

---

## Service / controller rules

Shared inventory-changing path: **`InventoryPostingService`**.

Preferred flow:

```text
Controller → Auth → Domain Service → DB Transaction → Events
```

Explicit business errors (`INSUFFICIENT_STOCK`, `DOCUMENT_ALREADY_POSTED`, …).  
Idempotency for scanner/mobile retries.  
Concurrency via PostgreSQL transactions / atomic updates.

---

## UI / DoD (short)

UI: searchable DataTables, server filters, pagination, status badges, detail
pages with document flow, approval history, attachments, audit — not isolated CRUD.

**Done only when** schema + API + domain rules + validation + audit (+ workflow if needed) + inventory/valuation/accounting impacts + UI + tests apply. Frontend-only is not complete.

---

## Pre-coding checklist

Answer before coding:

1. Which business process?
2. Which MM module owns it?
3. Source document? Created document?
4. Physical inventory change? Availability? Valuation?
5. FICO accounting event?
6. Workflow? Audit?
7. Which existing service to reuse?
8. Which other MM modules consume this?

---

## Final principle

```text
              MATERIALS MANAGEMENT
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
  PLANNING        PROCUREMENT       WAREHOUSE
      │                │                │
      └────────────────┼────────────────┘
                       ▼
                  INVENTORY
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         RECEIVING   RESERVE    ISSUE
             │         │         │
             └─────────┼─────────┘
                       ▼
               INVENTORY LEDGER
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         BALANCE    VALUATION   AUDIT
                       │
                       ▼
                      FICO
```

Ledger = authoritative history · Balance = current stock · Warehouse = location/execution · Procurement = acquisition · Planning = replenishment · Valuation = monetary value · FICO = accounting.

Keep these boundaries intact.

## Additional resources

- Full contract (architecture, flows, permissions, tables, priority order): [reference.md](reference.md)
