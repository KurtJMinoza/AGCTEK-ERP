# Materials Management — Demo Walkthrough

Rebuild a **clean, story-driven** MM dataset (no old test rows):

```bash
cd backend
npm run prisma:seed-mm-demo
```

Uses `prisma/tsconfig.seed.json` so the command works on Windows without fragile `--compiler-options` quoting.

Company: **AGCTEK** · Plant **PLT-MAIN** · Warehouses **MAIN** + **SECONDARY**

---

## End-to-end story (recommended order)

| Step | Module (nav) | What to open | Demo document / ID |
| --- | --- | --- | --- |
| 1 | MM Dashboard | Overview | Filters: company AGCTEK, warehouse MAIN |
| 2 | Organization | Companies / Plants / Branches | AGCTEK, PLT-MAIN, BR-HQ |
| 3 | Material Master | Materials | **MAT-STEEL-001**, **MAT-LAPTOP-001**, **MAT-BOX-001**, **MAT-GLV-001** |
| 4 | Material Master | Barcodes / Batches | EAN on materials; batch **LOT-2026-001** (gloves) |
| 5 | Supplier Management | Suppliers | **SUP-ACME**, **SUP-TECHWORLD** + linked materials/prices |
| 6 | Warehouse Master | Warehouses / Storage | **MAIN** topology (Receiving → Shipping zones), bins **A01-01-001**, **P01-01-001**, … |
| 7 | Planning | Demand / Reorder / MRP | Demand (demo-seed); MRP run **MRP-FLOW-00001** + procurement suggestion |
| 8 | Procurement | Requisitions | **REQ-DEMO-00001** (DRAFT), **REQ-DEMO-00002** (APPROVED) |
| 9 | Procurement | RFQ / Quotations | **RFQ-DEMO-00001**; quotation **SQ-FLOW-00001** |
| 10 | Procurement | Purchase orders / Contracts | **PO-DEMO-00001** (approved); contract **PC-FLOW-00001** |
| 11 | Receiving | ASN / Expected receipts | **ASN-FLOW-00001** → **ER-FLOW-00001** |
| 12 | Receiving | Receiving / Variances | **RCV-FLOW-00001** (validated); under-receipt variance (−20 pcs) |
| 13 | Receiving | Goods receipts / Inspection | **GR-FLOW-00001** (posted); lot **IL-FLOW-00001** (in progress) |
| 14 | Inventory | Stock overview / Ledger | Opening balances + **GR-DEMO-00001** history |
| 15 | Inventory | Goods issue | **GI-FLOW-00001** (DRAFT — post to consume stock) |
| 16 | Stock transfer | Transfer orders | **STO-FLOW-00001** MAIN → SECONDARY (DRAFT) |
| 17 | Warehouse execution | Putaway / Picking / Packing | **PA-000001…**, wave **WV-000001**, package **PKG-000001** |
| 18 | Warehouse execution | Task queue / Exceptions | **WT-FLOW-001…005** (incl. **WT-FLOW-005** exception) |
| 19 | Warehouse execution | Warehouse transfers | **TO-000001** (draft WM transfer) |
| 20 | Inventory control | Cycle count | **CC-DEMO-00001** (OPEN) |
| 21 | Valuation | Inventory valuation | Moving average on steel / laptop / boxes |
| 22 | Supplier performance | Evaluation config | Score weights seeded for AGCTEK |

---

## Core materials (quick reference)

| Code | Name | Role in story |
| --- | --- | --- |
| MAT-STEEL-001 | Steel Rod 10mm | Raw material; reorder/MRP; pick/putaway |
| MAT-LAPTOP-001 | Business Laptop 15" | Finished good; RFQ/PO; high value |
| MAT-BOX-001 | Corrugated box | Packaging; bulk stock in B01 |
| MAT-GLV-001 | Safety gloves (batch) | Inbound + quality inspection chain |
| MAT-OIL-001 | Machine lubricant | Consumable |
| MAT-SERV-001 | IT support (hour) | Non-inventory service item |

---

## Notes

- **Purging** truncates all `mm_*` and `wm_*` tables and removes warehouses, then re-seeds. SCM/FICO/users are untouched.
- Physical stock in UI comes from **MmInventoryBalance** + ledger rows seeded as opening balances; posting new GR/GI still goes through API services in normal use.
- Re-run `npm run prisma:seed-mm-demo` anytime to reset the walkthrough.
