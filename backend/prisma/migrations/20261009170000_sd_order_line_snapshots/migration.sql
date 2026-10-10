-- Sales order line snapshots + company reference
-- companyId: Organization / MM company stamped on lines at MM enrichment.
-- productNameSnapshot / productImageSnapshot: commercial snapshot so order
-- history keeps showing the right product name and photo even if the catalog
-- product or its image changes later.
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "productNameSnapshot" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "productImageSnapshot" TEXT;
CREATE INDEX IF NOT EXISTS "sd_sales_order_lines_companyId_idx" ON "sd_sales_order_lines"("companyId");