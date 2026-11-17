---
name: pos-order-flow
description: >-
  Permanent engineering skill for the corrected order-entry and fulfillment flow.
  Covers POS counter flow vs E-Commerce/B2B/CRM flow, MM & catalog master data
  setup (bulk import, barcode management), payment modes (Cash, GCash, Bank
  Transfer, Loan/Salary Deduct) with financial integration, and automated
  reporting replacing five manual Excel sheets. Use before any SD/POS/MM/order
  reporting work.
---

# POS & Order Flow — Permanent Engineering Skill

## Mandate

You are the **order-entry & fulfillment flow specialist** for this existing ERP.

Before any design or code:

1. **Inspect** the repository for existing order, payment, inventory, and reporting surface area.
2. **Reuse** authoritative services, tables, routes, and UI patterns — do not build parallel engines.
3. **Enhance** what exists; never duplicate stock logic, posting, or fulfillment logic.
4. **Preserve** the MM single-posting invariant: physical stock changes go through `InventoryPostingService` only (MM-08).

Also respect: `AGENTS.md`, `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md`, `.cursor/rules/erp-ui.mdc`, `.cursor/rules/mm-architecture.mdc`, `.cursor/skills/materials-management/SKILL.md`.

**Enterprise role of SD/POS flow:** commercial order capture + channel-specific fulfillment routing + payment + billing + reporting. MM owns stock; SD never posts inventory.

---

## Part 1 — Corrected Order Entry & Fulfillment Flow

### Channel A: POS (Point of Sale Counter)

POS transactions happen instantly at the counter and do **not** require warehouse pick, pack, or dispatch.

```text
Cashier selects branch + opens shift + inputs starting cash drawer balance
    ↓
Scan/lookup product barcode or catalog item
    ↓ (barcode not found in MM → Quick-Add Fallback prompt: Name, Category, Cost, SRP;
       instantly save to MM and add to cart)
    ↓
Customer selects payment mode: Cash | GCash | Bank Transfer | Loan (Salary Deduct / Employee Ledger)
    ↓
Payment clears → print Sales Receipt → inventory deducted instantly from counter/store stock
    ↓
No warehouse picking or shipping required
```

### Channel B: E-Commerce, B2B Standard Orders, & CRM Won Deals

```text
Order capture: online stores (Shopee/Lazada), manual standard entry, or CRM won deals
    ↓
Stock verification & reservation against Materials Management (MM) availability
    ↓
Warehouse release → Pick → Pack → Dispatch → Goods Issue posted
    ↓
Shipment tracking attached → Proof of Delivery (POD) captured → invoices marked paid upon collection
```

### Channel routing rule

| Channel | Warehouse pick/pack | Dispatch | Goods Issue | Invoice timing |
|---------|--------------------|----------|-------------|----------------|
| POS counter | none | none | instant counter stock deduction | Sales Receipt at payment |
| E-Commerce / B2B / CRM won | required | required | posted at trip start / courier booking | DRAFT at GI, ISSUED at POD |

CRM Closed Won hands off to SD as a draft `ECOMMERCE` order tagged to the opportunity (idempotent on `crmOpportunityId`).

---

## Part 2 — Master Data & Product Setup (MM & Catalog Integration)

### Excel Bulk Product Import

MM provides bulk import where administrators upload an Excel sheet with product details: Barcode, Product Name, Category, Brand, Unit Cost, SRP, Stock Quantity.

Business logic:
- Validate required columns
- Update existing items matched by Barcode
- Add new items
- Preserve sales receipts / invoices referencing the product (do not cascade-delete linked transactions)

### Barcode Scanner / Catalog Management

Staff can scan or search barcodes directly in MM to update prices, stock levels, or product attributes without manual data entry. Scanner events are idempotent (idempotency key) and write through MM posting — no scanner-side stock math.

---

## Part 3 — Payment Modes & Financial Integration

Four primary tender types across POS and Billing:

| Tender | Behavior |
|--------|----------|
| Cash | Physical cash tendered; cash drawer tracks expected vs. actual amounts |
| GCash / Bank Transfer | Digital payment verified via reference number / transaction ID |
| Loan / Salary Deduct | Links to employee master account; validates against employee credit/loan limit; posts AR debit to employee's payroll ledger for automatic salary deduction in next payroll cycle |

Financial rule: Loan/Salary Deduct creates an AR receivable (employee payroll ledger) that settles via payroll deduction — FICO owns the GL posting; SD records the intent only until the AR journal exists.

---

## Part 4 — Automated Reporting & Analytics (replacing five manual Excel sheets)

| Replaces | Module / dashboard | Business logic |
|----------|-------------------|----------------|
| SALES RECEIPT.xlsx | Automated Sales Receipt & Invoice Generation | Every completed POS checkout or approved order generates a standardized Sales Receipt / Invoice: Barcode, Description, Qty, Unit Price, Line Discounts, Net Totals |
| 2026 PC SALES.xlsx | POS Cashier Terminal & Line-Item Sales Entry | Daily itemized sales, customer names, barcode tracking, SRP, discounts, net sales logged in real-time at the terminal |
| Daily Collection Report 2026.xlsx | EOD Shift Closing & Cashier Reconciliation | End-of-shift report tallies collections by payment instrument (Cash, GCash, Bank Transfer, Cheque, Salary Loan Deduction); compares physical drawer count vs. system log; records electronic cashier + supervisor sign-offs |
| Monthly Collection 2026.xlsx | Dynamic Monthly Collection Dashboard | Aggregates collections across all channels and payment types by month (Jan–Dec) on demand; no manual multi-sheet compilation |
| SALES REPORT (JUNE-DECEMBER 2026).xlsx | Sales & Profitability Analysis | Calculates COGS vs. total SRP, discounts, subtotal, sales type, invoice numbers across channels (POS, Online, B2B); gross margins and inventory performance |

Reporting rule: dashboards read from database views / backend APIs; frontend performs no authoritative COGS, margin, or collection math.

---

## Ownership matrix

| Concern | Owner | Rule |
|---------|-------|------|
| Customer / commercial offer / order | SD | master |
| Material identity, stock, ATP | MM | consumer via MM APIs only |
| Reservation / allocation / pick / pack / GI | MM | SD requests & observes |
| Shipment / POD / courier | SCM | observes events |
| Invoice document & AR status | SD | master |
| GL / COGS / AR journal / payroll ledger | FICO | SD does not post GL |
| Cash drawer / shift close | SD (POS) | reconciliation report |

---

## Definition of done (POS & order flow)

- [ ] Channel routing (POS vs E-Commerce/B2B/CRM) enforced — POS skips pick/pack/GI
- [ ] POS shift open + starting cash drawer balance captured
- [ ] Quick-Add Fallback for unknown barcodes saves to MM and adds to cart
- [ ] Four tender types supported: Cash, GCash, Bank Transfer, Loan/Salary Deduct
- [ ] Loan validates employee credit/loan limit; AR debit to payroll ledger (FICO posts GL)
- [ ] MM bulk product import: validate columns, update by barcode, add new
- [ ] Barcode scan/search updates price/stock/attributes via MM, idempotent
- [ ] Sales Receipt / Invoice generated at POS checkout and approved order
- [ ] EOD shift closing with payment-instrument breakdown + drawer variance + sign-offs
- [ ] Monthly collection dashboard by channel/payment type
- [ ] Sales & profitability analysis: COGS vs SRP across POS / Online / B2B
- [ ] No client-side stock math; all availability from MM APIs
- [ ] Tests added; typecheck, lint, build run; no regressions in existing SD/MM flows
