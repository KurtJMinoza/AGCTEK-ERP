-- Product bulk import: one batch per uploaded workbook, one row per sheet row.
-- Existing material/product data is never rewritten by this migration.

CREATE TABLE "sd_product_import_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SD',
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "idempotencyKey" TEXT,
    "companyId" TEXT,
    "divisionId" TEXT,
    "createdBy" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "createdMaterialRows" INTEGER NOT NULL DEFAULT 0,
    "createdListingRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateBarcodeRows" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "sd_product_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sd_product_import_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "action" TEXT,
    "payload" JSONB NOT NULL,
    "errors" JSONB,
    "materialId" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_product_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sd_product_import_batches_batchNumber_key" ON "sd_product_import_batches"("batchNumber");
CREATE UNIQUE INDEX "sd_product_import_batches_idempotencyKey_key" ON "sd_product_import_batches"("idempotencyKey");
CREATE INDEX "sd_product_import_batches_status_createdAt_idx" ON "sd_product_import_batches"("status", "createdAt");
CREATE UNIQUE INDEX "sd_product_import_rows_batchId_rowNumber_key" ON "sd_product_import_rows"("batchId", "rowNumber");
CREATE INDEX "sd_product_import_rows_batchId_status_idx" ON "sd_product_import_rows"("batchId", "status");

ALTER TABLE "sd_product_import_rows"
    ADD CONSTRAINT "sd_product_import_rows_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "sd_product_import_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
