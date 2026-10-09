# SD Product Options & Variants

**Status:** Implemented (ADD SD variants — see `backend/prisma/migrations/20261030120000_add_sd_product_variants`)
**Owner:** SD (commercial representation). Stock remains MM-owned.

## Concept

```text
Parent product (display / grouping, one storefront page)
  ├── Product options      (generic: Size, Color, Bottle Size, Flavor, Pack…)
  │     └── Option values  (Medium, Large, 375 tablets, Strawberry, 2 bottles…)
  └── Variants             (the sellable stock item)
        ├── own SKU + barcode (unique)
        ├── own price / compare-at / cost / weight / image / active flag
        ├── one value per option (Black / Medium)
        └── linked MM material → ATP, reservation, goods issue
```

A product may have **zero variants** (simple product — unchanged behaviour) or
many. **Products with variants require the customer to select one** before
add-to-cart / checkout / POS line.

## Data model (SD)

| Model | Table | Notes |
| --- | --- | --- |
| `SdProductOption` | `sd_product_options` | name, sortOrder, isRequired, `displayStyle` (BUTTON · DROPDOWN · SWATCH · IMAGE · TILE); unique per product |
| `SdProductOptionValue` | `sd_product_option_values` | value, sortOrder, `swatchColor` (SWATCH), `imageUrl` (IMAGE); unique per option |
| `SdProductVariant` | `sd_product_variants` | `sku` and `barcode` globally unique; `materialId`/`companyId` link MM stock authority; `isDefault` (one per product) + `sortOrder` for display order |
| `SdProductVariantOptionValue` | `sd_product_variant_option_values` | exactly one value per option per variant |
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
| `materialId` | variant's MM material for ATP/reservation/GI | parent product's active MM assignment |
| everything else (name, category, brand, tax, rules, reviews…) | — | always the parent |

Cart and order lines snapshot parent product + selected variant (id, title,
option values, SKU, barcode, price, image), so old orders never change when
variant data is edited later.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/sd/products/:id/options-variants` | options + variants (admin editor + storefront) |
| PUT | `/api/v1/sd/products/:id/options-variants` | replace full options + variants (validated) |
| GET | `/api/v1/sd/products/variants/barcode/:barcode` | POS/scanner → exact variant (+ parent) |
| GET | `/api/v1/sd/products/variants/:variantId/availability` | per-variant MM availability |
| GET | `/api/v1/sd/products/:id/variants/availability` | batch per-variant availability |

Validation on save: option names unique; values unique per option; each
variant picks one value per option; variant combinations unique; SKU and
barcode unique; MM material/company must exist; empty arrays clear variants.

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
The parent product's material is never decreased when variants exist.
```

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
- **Admin**: Product Catalog dialog → "Options & Variants" step: option groups
  with display style and per-value swatch color/image, cartesian **Generate
  variants**, then edit SKU/barcode/price/compare-at/cost/weight/active, star a
  **default** variant, reorder with up/down, upload an image and pick the
  linked MM material per variant card. A toggle controls whether variant images
  replace the main photo. The wizard steps are clickable (back freely, forward
  only through valid steps); drafts still auto-save/restore but always reopen
  at step 1.

## Tests

`backend/src/sd/product-option-variants.service.spec.ts` — option/variant
creation, duplicate rejection (combos, SKU, values), clearing to a simple
product, exact variant resolution, barcode lookup, per-variant availability.
