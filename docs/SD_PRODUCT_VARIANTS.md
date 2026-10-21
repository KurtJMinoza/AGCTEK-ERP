# SD Product Options & Variants

**Status:** Implemented — unified product-variant architecture.
Migrations: `20261030120000_add_sd_product_variants`,
`20261106120000_add_product_variant_architecture`,
`20261107120000_variant_owns_material` (data migration).
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
        └── ONE MM material → ATP, reservation, goods issue (own stock)
```

**Every product has at least one variant.** A SIMPLE product has exactly one
*hidden default* variant (`combinationKey = '__default__'`, `isHidden = true`);
a VARIABLE product has one visible variant per option combination. Products
with visible variants require the customer to select one before
add-to-cart / checkout / POS line.

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
| `SdProductVariant` | `sd_product_variants` | `sku` and `barcode` globally unique; `materialId`/`companyId` link MM stock authority; `combinationKey` unique per product; `isDefault` (one per product), `isHidden`, `isPublished` + `sortOrder` for display order |
| `SdProductVariantOptionValue` | `sd_product_variant_option_values` | exactly one value per option per variant |
| `MmMaterial` | `mm_materials` | `catalogVariantId` + `catalogSource` (AUTO_CREATED · MANUALLY_LINKED) — the Product Catalog origin of a generated material |
| `SdSalesOrderLine` | add `variantId` + `variantName`/`variantSku`/`variantBarcode` | snapshot for order history / invoices |
| `RetailCartItem` | add `variantId`/`variantName`/`variantSku` | retail session cart |

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
| POST | `/api/v1/sd/products/family` | **Unified create** — parent + options + values + variants + one MM material per variant, in ONE transaction |
| POST | `/api/v1/sd/products/:id/variants` | Add new option values + only the MISSING combinations (each with its own material) |
| PATCH | `/api/v1/sd/products/variants/:variantId/archive` | Archive a variant (hidden from the shop; stock and history preserved) |
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
6. create (or link) one MM material per variant
7. link each material to its exact variant
8. set the default variant
9. commit

If any material cannot be created the whole transaction rolls back — there is
never a product without variants, a variant without a material, or a material
without a variant.

`materialDefaults` carries the defaults applied to every generated material
(base/sales UoM, material category, standard cost, default warehouse, default
storage bin, safety/max/reorder stock, batch/serial/expiry tracking). An
individual variant may override them. `existingMaterialId` links an existing
material instead of creating one (same company only).

Validation on save: option names unique; values unique per option; each
variant picks one value per option; variant combinations unique (**409** on a
duplicate inside one request); SKU and barcode unique; MM material/company must
exist; empty arrays clear variants.

The admin editor mirrors these rules client-side
(`src/modules/sd/services/productOptionVariantsValidation.ts`): a failed save
shows the specific issues inline instead of a generic HTTP 400, and the
wizard jumps to the Options & Variants step. Variant images are uploaded via
`POST /api/v1/sd/products/images` (file picker per variant) and stored as the
variant's `imageUrl`.

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
- **Admin**: Product Catalog dialog → steps *Product info → Material defaults →
  Pricing & media → Details → Options & Variants → Review*. The Material
  defaults step collects the defaults for the generated Material Masters; the
  Review step shows the parent, the variant count and the number of materials
  to be created, and the final button is **Create Product and Materials**.
  Expanding a catalog row shows the **Variants** table (Variant · Material ·
  Price · On hand · Reserved · Available) with an *Open in Materials
  Management* link — the stock columns are read-only.

## Tests

- `backend/src/sd/product-family.service.spec.ts` — one parent + N variants,
  one material per variant, no parent assignment for VARIABLE products, hidden
  default variant for SIMPLE products, duplicate-combination/SKU rejection,
  transaction rollback, cross-company material rejection, add-later creates
  only the missing combinations.
- `backend/src/sd/product-option-variants.service.spec.ts` — option/variant
  creation, duplicate rejection (combos, SKU, values), clearing to a simple
  product, exact variant resolution, barcode lookup, per-variant availability
  (a variant without a material reports `NOT_MAPPED`, never the parent's).
