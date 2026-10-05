# Materials Management — Demo Walkthrough

**Demo MM auto-seed is disabled.** Create company, plant, warehouse, materials, and transactions via **Material Master** and other MM screens, or purge leftover demo rows:

```bash
cd backend
npm run prisma:seed-mm-purge
```

Uses `prisma/tsconfig.seed.json` so the command works on Windows without fragile `--compiler-options` quoting.

---

## Suggested walkthrough order (after you create masters in the UI)

| Step | Module (nav) | What to configure |
| --- | --- | --- |
| 1 | Organization | Company, plant, branch |
| 2 | Material Master | Materials / SKUs, UOM, barcodes |
| 3 | Supplier Management | Suppliers and supplier materials |
| 4 | Warehouse Master | Warehouses, storage types, bins |
| 5 | Planning | Demand, reorder, MRP (optional) |
| 6 | Procurement → Receiving → Inventory | Requisition through goods receipt |
| 7 | Warehouse execution | Putaway, picking, packing |
| 8 | Valuation | Standard cost / moving average |

---

## Notes

- **`prisma:seed-mm-purge`** truncates `mm_*` / `wm_*` and deletes warehouses; it does **not** re-seed demo documents.
- **`prisma db seed`** (default) runs **SCM connected demo only** — no MM or SD product seeds.
- SCM/FICO/users are not removed by MM purge.
