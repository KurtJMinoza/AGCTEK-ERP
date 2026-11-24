-- Barcode snapshot on external platform sale lines, and void details on the sale.
ALTER TABLE "sd_ext_platform_transaction_lines" ADD COLUMN "barcode" TEXT;

ALTER TABLE "sd_ext_platform_transactions"
    ADD COLUMN "voidedAt" TIMESTAMP(3),
    ADD COLUMN "voidedBy" TEXT,
    ADD COLUMN "voidReason" TEXT;

-- Backfill existing lines: sold variant barcode, else the product's default
-- variant barcode, else the material's primary active MM barcode.
UPDATE "sd_ext_platform_transaction_lines" l
SET "barcode" = COALESCE(
    (
        SELECT NULLIF(TRIM(v."barcode"), '')
        FROM "sd_product_variants" v
        WHERE v."id" = l."variantId"
    ),
    (
        SELECT NULLIF(TRIM(v."barcode"), '')
        FROM "sd_products" p
        JOIN "sd_product_variants" v ON v."id" = p."defaultVariantId"
        WHERE p."id" = l."productId"
    ),
    (
        SELECT bc."barcodeValue"
        FROM "mm_barcodes" bc
        WHERE bc."materialId" = l."materialId"
          AND bc."isPrimary" = true
          AND bc."status" = 'ACTIVE'
          AND bc."deletedAt" IS NULL
        ORDER BY bc."createdAt"
        LIMIT 1
    )
)
WHERE l."barcode" IS NULL;