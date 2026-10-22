# SD Product Options & Variants

**Status:** Implemented — unified product-variant architecture, **material-first**.
Migrations: `20261030120000_add_sd_product_variants`,
`20261106120000_add_product_variant_architecture`,
`20261107120000_variant_owns_material` (data migration),
`20261108120000_variant_links_existing_material`.
**Owner:** SD (commercial representation). Stock remains MM-owned.

## Concept

```text
Parent product (display / grouping, one storefront page, holds NO stock)
  ├── Product options      (generic: Size, Color, Bottle Size, Flavor, Pack…)
  │     └── Option values  (Medium, Large, 375 tablets, Strawberry, 2 bottles…)
  └── Variants             (the sellable stock item)
        ├── own SKU + barcode (unique)
        ├── own price / compare-at / cost / weight / image / active flag
        ├── one value per option (Black / Medium)
        └── ONE EXISTING MM material → ATP, reservation, goods issue (own stock)
```

**Every product has at least one variant.** A SIMPLE product has exactly one
*hidden default* variant (`combinationKey = '__default__'`, `isHidden = true`);
a VARIABLE product has one visible variant per option combination. Products
with visible variants require the customer to select one before
add-to-cart / checkout / POS line.

### The Product Catalog never creates a material

Materials are created **manually** under
`Materials Management → Material Master → Materials and Stock Keeping Units`.
The Product Catalog only **links** an existing material to a variant:

```text
Material Master creation
  → Product Catalog parent product
  → Add Variant
  → Select existing Material Master item
  → Save child variant
  → Read stock from Materials Management
```

No code path in the Product Catalog creates a material, a material SKU, an
opening stock row or a stock balance. The variant's sellable SKU **is** the
material's Stock Keeping Unit — it is read, never generated.

A material may back **one active variant** (partial unique index
`sd_product_variants_active_material_key`).

### The parent never holds stock

For a VARIABLE product the parent has **no** `SdProductMaterialAssignment`.
The variant's `materialId` is the single stock authority. Parent assignments
are only kept (active) for SIMPLE products, where they are unambiguous
(one hidden default variant → one material).

Consequently, a variant without a linked material reports **`NOT_MAPPED`** —
it is never silently backed by the parent's material, because that would sell
another variant's stock.

## Data model (SD)

| Model | Table | Notes |
| --- | --- | --- |
| `SdProduct` | `sd_products` | `productConfig` (SIMPLE · VARIABLE), `defaultVariantId`, `idempotencyKey` |
| `SdProductOption` | `sd_product_options` | name, sortOrder, isRequired, `displayStyle` (BUTTON · DROPDOWN · SWATCH · IMAGE · TILE); unique per product |
| `SdProductOptionValue` | `sd_product_option_values` | value, sortOrder, `swatchColor` (SWATCH), `imageUrl` (IMAGE); unique per option |
| `SdProductVariant` | `sd_product_variants` | `sku` and `barcode` globally unique; `materialId`/`companyId` link MM stock authority; `combinationKey` unique per product; `idempotencyKey` (double submit); `isDefault` (one per product), `isHidden`, `isPublished` + `sortOrder` for display order |
| `SdProductVariantOptionValue` | `sd_product_variant_option_values` | exactly one value per option per variant |
| `MmMaterial` | `mm_materials` | `catalogVariantId` + `catalogSource` (AUTO_CREATED · MANUALLY_LINKED) — the Product Catalog origin of a linked material |
| `SdSalesOrderLine` | add `variantId` + `variantName`/`variantSku`/`variantBarcode` | snapshot for order history / invoices |
| `RetailCartItem` | add `variantId`/`variantName`/`variantSku` | retail session cart |

The `combinationKey` is the normalized option combination, e.g.
`color:black|size:medium`. It is **always** written on create — without it
every variant fell back to the schema default `__default__` and the second
insert violated the unique `(productId, combinationKey)` constraint (HTTP 500).

A product **without** customer-selectable options has no combination to key
on. Its variants are keyed by the material they link
(`material:<materialId>`), because a material may back only one active
variant. Without this, every variant of such a product shared the key
`__default__`, and adding a second variant was rejected with
*"… already exists for this product."* even though it did not exist.

| Product | Combination key | Duplicate check |
| --- | --- | --- |
| has options | `color:black\|size:medium` | the option combination must be new → 409 |
| no options | `material:<materialId>` (first default variant: `__default__`) | the **material** must be new → 409 *"This material is already linked to another variant (…)"* |

Owner: `backend/src/sd/product-combination-key.ts`
(`optionCombinationKey`, `materialCombinationKey`, `variantCombinationKey`,
`humanCombination`).

Saving a product that has no options must **not** drop its variants: the
options-and-variants endpoint replaces the variants from the payload, and a
variant of an option-less product carries no option values. (It used to
delete every variant and recreate none, losing the material links of a SIMPLE
product on every edit.)

Product display setting: `SdProduct.attributes.variantImageMode` (`replace` |
`keep`) — whether the selected variant image replaces the main product photo.
The save payload is `{ options, variants, variantImageMode? }`; one variant is
always the default (first when none is marked).

## Inheritance (same product, different sellable version)

A variant is never a separate product: the parent page, category, brand,
description, reviews, policies, tax, channels and visibility stay on the parent
product. Variants only carry sellable differences and **inherit the parent
value when empty**:

| Field | Variant set | Variant unset (null) |
| --- | --- | --- |
| `price` | override price (cart/order use it) | parent product price |
| `compareAtPrice` | variant discount | parent original price — only while the price is also inherited; a custom price drops the parent discount |
| `imageUrl` | shown after selection (mode `replace` swaps the main photo) | parent product images |
| `weight` | variant weight | parent product weight |
| `materialId` | variant's MM material for ATP/reservation/GI | **none** — a VARIABLE product's parent holds no stock; the variant reports `NOT_MAPPED` |
| everything else (name, category, brand, tax, rules, reviews…) | — | always the parent |

Cart and order lines snapshot parent product + selected variant (id, title,
option values, SKU, barcode, price, image), so old orders never change when
variant data is edited later.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/sd/products/family` | **Unified create** — parent + options + values + variants, each linking an EXISTING material, in ONE transaction |
| POST | `/api/v1/sd/products/:id/variants` | **Add ONE child variant** linking an existing material (idempotent) |
| PATCH | `/api/v1/sd/products/:id/variants/:variantId` | Edit a variant (options, name, price, image, active/published, material link) |
| PATCH | `/api/v1/sd/products/variants/:variantId/archive` | Archive a variant (hidden from the shop; stock and history preserved) |
| GET | `/api/v1/sd/products/linkable-materials` | Materials that may back a variant (same company, active, sellable, with a SKU, not linked elsewhere) |
| GET | `/api/v1/sd/products/variants-summary` | Per-product variant count + availability summed across the variants |
| GET | `/api/v1/sd/products/:id/options-variants` | options + variants (admin editor + storefront) |
| PUT | `/api/v1/sd/products/:id/options-variants` | replace full options + variants (validated) |
| GET | `/api/v1/sd/products/variants/barcode/:barcode` | POS/scanner → exact variant (+ parent) |
| GET | `/api/v1/sd/products/variants/:variantId/availability` | per-variant MM availability (admin) |
| GET | `/api/v1/sd/products/:id/variants/availability` | batch per-variant availability (admin) |
| GET | `/api/v1/sd/products/storefront/availability?variantId=` | public storefront ATP for one variant |

### Unified creation (`POST /sd/products/family`)

One server operation, one database transaction:

1. validate the company
2. create the parent product (idempotent via `idempotencyKey`)
3. create the options + option values
4. generate the normalized combinations (`combinationKey` = `color:black|size:medium`)
5. create one variant per enabled combination
6. **link** one EXISTING MM material per variant
7. set the default variant
8. commit

If any material cannot be linked the whole transaction rolls back — there is
never a product without variants, a variant without a material, or a material
without a variant.

`materialDefaults` only carries the owning `companyId` (and an optional
category label). The material itself comes from `existingMaterialId` — SIMPLE
products use the root `existingMaterialId`, VARIABLE products use
`variants[].existingMaterialId`.

### Add variant (`POST /sd/products/:id/variants`)

The dedicated endpoint for adding a child variant. The request carries only:
the material id, the selected option values, an optional display name / price /
image, the default + published flags and an idempotency key. It never carries
a material payload, an opening stock, a material cost or a warehouse update.

The service: loads the parent → validates the company → loads the material →
validates it (exists · same company · active · sellable · has a SKU · not
linked to another active variant) → normalizes the combination key → rejects a
duplicate combination (**409**, only for a product that has options) →
creates ONE child variant → links the material → sets the default variant when
none exists → commits → returns the updated parent product.

Validation errors map to:

| Case | Response |
| --- | --- |
| Product not found | 404 Not Found |
| Material not found / deleted | 404 Not Found |
| Material from another company | 400 Validation Error |
| Material inactive / not sellable / no SKU | 400 Validation Error |
| Material already linked to another active variant | 409 Conflict |
| Duplicate variant combination | 409 Conflict |
| Duplicate request (same idempotency key) | the existing result, no second variant |

Validation on save: option names unique; values unique per option; each
variant picks one value per option; variant combinations unique (**409** on a
duplicate inside one request); SKU and barcode unique; MM material/company must
exist. A product **without** options accepts variants with no option values,
and its variants are told apart by their material (the same material twice is a
**409**). The barcode check ignores the product's **own** current variants, so
re-saving an unchanged product does not fail.

The admin editor mirrors these rules client-side
(`src/modules/sd/services/productOptionVariantsValidation.ts`): a failed save
shows the specific issues inline instead of a generic HTTP 400, and the
wizard jumps to the Options & Variants step. Variant images are uploaded via
`POST /api/v1/sd/products/images` (file picker per variant) and stored as the
variant's `imageUrl`.

### The variant is a complete, sellable record

`POST /sd/products/:id/variants` writes every field a sellable variant needs:

| Field | Source |
| --- | --- |
| `sku` | the material's Stock Keeping Unit (read, never generated) |
| `barcode` | the caller's barcode, else the **material's primary barcode**; unique across variants (409 on a clash) |
| `materialId` / `companyId` / `salesUomId` | the linked material |
| `price` | the caller's override, else inherited from the parent product |
| `weight` | the caller's value (shipping) |
| `imageUrl` | the uploaded picture, else the parent product's photo |
| `optionValues` | one value per product option |
| `isDefault` / `isPublished` / `sortOrder` | the first variant becomes the default when none exists |

Adding a variant to a product that had only a **hidden** default variant (a
SIMPLE product) makes it VARIABLE and **un-hides** that default: the product now
sells more than one item, so the original must stay on the storefront.

### The variant on the storefront

The shop product page (`/shop/<store>/<sku>`) shows the variants:

- A product **with** options → the option controls (buttons, swatches, tiles…),
  and the selected variant is shown in the buy panel.
- A product **without** options → a **"Choose a variant"** list (picture, label,
  SKU, barcode, price and the product it belongs to). The hidden default
  variant of a SIMPLE product is never listed; it stays the sellable item of a
  product that has no visible variant.

The variant's label is its **option values** ("Small / Medium"), falling back to
its own name — `variantLabel()` in
`src/modules/sd/services/productOptionVariantsService.ts`. The buy panel
repeats the label, the SKU, the barcode and the parent product, and the stock
shown is always the **variant's own** material stock.

### Uploads are served by the API

Next.js snapshots `public/` when it starts, so a picture uploaded while the app
runs used to 404 until the web app restarted. The API now streams the uploads
from disk (`GET /api/v1/uploads/products/<file>`, and `/uploads/deliveries/…`),
and the web app rewrites `/uploads/*` to it — so an uploaded picture is
visible immediately, in the catalog, the shop and the POS.

Owner: `backend/src/sd/uploads.controller.ts`,
`backend/src/sd/product-image-storage.ts` (`uploadFilePath`,
`uploadContentType`).

## Stock rules (MM remains the authority)

```text
variant.materialId → CommercialAvailabilityService / MM ATP (per variant)
SD confirm/cart  → line.variantId  → pipeline resolves the VARIANT's material
MM reservation / goods issue operate on that material.
The parent product's material is never used when variants exist.
```

```text
Available = On hand − Reserved − Blocked − Under quality inspection
```

The Product Catalog only **reads** stock; it never owns an editable stock
field. New materials start at zero stock — stock is added through a goods
receipt, opening inventory, adjustment, stock transfer or approved return.

## Flows

- **Storefront**: option selectors follow the admin display style (buttons,
  dropdown, color swatches, image swatches, tiles) → the default variant is
  preselected → changing a value resolves the exact variant → variant
  price/compare-at, image (when `variantImageMode = replace`), SKU/barcode and
  per-variant stock (available · on hand · reserved) update. Values without an
  ACTIVE variant combining are disabled. Add-to-cart requires a selected,
  active variant.
- **POS**: scanning a variant barcode adds the exact variant at its own price;
  scanning/tapping a parent with multiple variants opens a **variant picker**
  (default pinned); a single active variant is added directly; the parent alone
  cannot be sold. Receipts print the selected variant.
- **Admin**: Product Catalog dialog → steps *Product info → Material →
  Pricing & media → Details → Options & Variants → Review*. The Material step
  selects the company and — for a SIMPLE product — the **existing** Material
  Master item; a VARIABLE product links one material per variant in the
  Options & Variants step. The Review step shows the parent, the variant count
  and how many existing materials are linked, and the final button is
  **Create Product and Materials**.

  Adding a variant uses ONE modal (`AddVariantDialog`) opened from the
  **Variants** panel header of the expanded catalog row — there is exactly one
  Add Variant button, one form and one submission handler. The modal shows the
  parent information read-only, the option selections, the display name / price
  / image overrides and a searchable **Existing Material Master item** picker
  (material number, name, SKU, barcode, company, UoM, on-hand / reserved /
  available, warehouse, status) with a *Refresh materials* action and a link to
  Material Master. There is no *Create Material* button in the modal.

  Expanding a catalog row shows the **Variants** table (Variant · Material ·
  Price · On hand · Reserved · Available) with an *Open in Materials
  Management* link — the stock columns are read-only. The catalog list shows
  one parent product with *N Variants* and the availability summed across the
  variants.

## Tests

- `backend/src/sd/product-variant.service.spec.ts` — add a variant increases the
  variant count by one and never the parent count or the material count; the
  variant links the existing material; a missing / cross-company / inactive /
  already-linked material is rejected; a duplicate combination is a conflict; a
  double submit creates one variant; editing a variant creates no material and
  never deletes the old one.
- `backend/src/sd/product-family.service.spec.ts` — one parent + N variants,
  every variant linked to an EXISTING material, no material is ever created, no
  parent assignment for VARIABLE products, hidden default variant for SIMPLE
  products, duplicate-combination/SKU rejection, cross-company / inactive /
  not-sellable / no-SKU rejection.
- `backend/src/sd/product-option-variants.service.spec.ts` — option/variant
  creation, duplicate rejection (combos, SKU, values), a distinct
  `combinationKey` per variant (regression for the HTTP 500), clearing to a
  simple product, exact variant resolution, barcode lookup, per-variant
  availability (a variant without a material reports `NOT_MAPPED`, never the
  parent's).

## Audit: materials auto-created by the old bug

Materials that the Product Catalog created before the material-first change
are **never deleted automatically** (they may carry stock or history).
`npm run prisma:report-auto-created-materials` classifies them:

```text
with inventory           -> do not archive
with transaction history  -> do not archive
referenced by orders      -> do not archive
linked to a variant       -> review the link
unused                    -> safe to archive
```

Only confirmed-unused rows may be archived, and the audit history is
preserved:

```bash
npm run prisma:report-auto-created-materials -- --archive <materialId> [...]
```
