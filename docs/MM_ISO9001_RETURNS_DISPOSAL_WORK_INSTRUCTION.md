# MM ISO 9001 — Returns, Disposal & Supplier Return Work Instruction

This document describes **implemented controls and evidence** for customer returns, damaged/expired stock, scrap/disposal, and supplier returns. It does **not** claim ISO 9001 certification.

## Architecture invariants

- **`InventoryPostingService`** is the only writer of physical inventory quantities.
- Customer returns: **intake → `QUALITY_INSPECTION` stock** (`RETURN_IN`); sellable only after disposition **transfer** to `UNRESTRICTED`.
- Scrap/disposal: **approve ≠ post**; **execute** (witness + method) required before ledger posting.
- Supplier return: **approve ≠ GI**; inventory decreases on **return goods issue post** only.
- Financial effects via **`MmAccountingEvent` / domain events** — not direct GL from controllers.

## Customer return (MM intake)

| Step | Status | Inventory |
| --- | --- | --- |
| Create | DRAFT | None |
| Physical intake | INTAKE | `RETURN_IN` → QI; receipt `RRC-YYYY-######` |
| Inspection | INSPECTION | None |
| Submit / approve | APPROVED | None |
| Complete dispositions | CLOSED | QI → target (UNRESTRICTED / BLOCKED / QI) |

API: `POST /api/v1/mm/returns-disposal/customer-returns/:id/intake`

## Scrap & disposal

| Step | Status | Inventory |
| --- | --- | --- |
| Submit / approve | APPROVED | None |
| Warehouse execution | EXECUTED | None (witness, method, manifest) |
| Post | POSTED / CLOSED | `SCRAP` movement from blocked stock |

API: `POST .../disposals/:id/execute` then `POST .../disposals/:id/post`

## Damaged & expired

- `identifyDamage`: UNRESTRICTED → BLOCKED (transfer pair).
- `markExpired` / `blockExpiredStock`: → EXPIRED (or configured status).
- Exception Center: expired batch still unrestricted, open disposals, pending returns.

## Supplier return

Existing flow: approve → pick/ship → `post` (`RETURN_OUT` from quarantine/blocked) → supplier memo events.

## Roles (backend permissions)

- `mm.returns-disposal.customer-return-intake`
- `mm.returns-disposal.damaged-stock` / `expired-stock`
- `mm.returns-disposal.scrap` / `disposal`
- `mm.returns-disposal.supplier-returns`

## UI

- Workflow strip: `Iso9001ReturnsDisposalWorkflowStrip` on intake, scrap, disposal pages.
- Scrap/disposal: **Record execution** before **Post to ledger**.

## Traceability

Document chains remain on SD sales return → MM customer return → inspection → disposition → credit/refund; PO → GR → supplier return → memo.
