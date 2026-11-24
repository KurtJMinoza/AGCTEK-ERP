-- Batch / lot identifiers on MM batches and commercial line snapshots.

ALTER TABLE "mm_batches" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "mm_batches_materialId_lotNumber_key"
    ON "mm_batches" ("materialId", "lotNumber")
    WHERE "lotNumber" IS NOT NULL AND "deletedAt" IS NULL;

ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "batchNumber" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;

ALTER TABLE "sd_sales_order_lines" DROP CONSTRAINT IF EXISTS "sd_sales_order_lines_batchId_fkey";
ALTER TABLE "sd_sales_order_lines"
    ADD CONSTRAINT "sd_sales_order_lines_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "mm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sd_sales_order_lines_batchId_idx" ON "sd_sales_order_lines" ("batchId");

ALTER TABLE "sd_ext_platform_transaction_lines" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "sd_ext_platform_transaction_lines" ADD COLUMN IF NOT EXISTS "batchNumber" TEXT;
ALTER TABLE "sd_ext_platform_transaction_lines" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;

ALTER TABLE "sd_ext_platform_transaction_lines" DROP CONSTRAINT IF EXISTS "sd_ext_platform_transaction_lines_batchId_fkey";
ALTER TABLE "sd_ext_platform_transaction_lines"
    ADD CONSTRAINT "sd_ext_platform_transaction_lines_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "mm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sd_ext_platform_transaction_lines_batchId_idx"
    ON "sd_ext_platform_transaction_lines" ("batchId");