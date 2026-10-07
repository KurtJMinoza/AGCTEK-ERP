-- AlterTable
ALTER TABLE "sd_sales_order_lines" ADD COLUMN "divisionId" TEXT;

-- Backfill: existing orders are single-division, so lines inherit the header.
UPDATE "sd_sales_order_lines" AS l
SET "divisionId" = o."divisionId"
FROM "sd_sales_orders" AS o
WHERE l."salesOrderId" = o."id"
  AND l."divisionId" IS NULL
  AND o."divisionId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "sd_sales_order_lines_divisionId_idx" ON "sd_sales_order_lines"("divisionId");
