-- AlterTable
ALTER TABLE "sd_sales_orders" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE INDEX "sd_sales_orders_branchId_createdAt_idx" ON "sd_sales_orders"("branchId", "createdAt");
