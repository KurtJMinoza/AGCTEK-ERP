-- AlterTable
ALTER TABLE "sd_sales_orders" ADD COLUMN     "crmOpportunityId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ERP';

-- Backfill source from channel; historical orders are never attributed to CRM.
UPDATE "sd_sales_orders" SET "source" = 'POS' WHERE "channel" = 'POS';
UPDATE "sd_sales_orders" SET "source" = 'WEBSITE' WHERE "channel" = 'ECOMMERCE';

-- CreateIndex
CREATE UNIQUE INDEX "sd_sales_orders_crmOpportunityId_key" ON "sd_sales_orders"("crmOpportunityId");

-- CreateIndex
CREATE INDEX "sd_sales_orders_source_createdAt_idx" ON "sd_sales_orders"("source", "createdAt");
