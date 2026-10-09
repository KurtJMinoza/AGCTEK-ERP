-- Customer return integration — Phase 4: link the MM customer return intake to the SD sales
-- return that opened it and to the originating SCM damage report. Both references live on the
-- MM-owned record (MM writes only its own table); `sdSalesReturnId` is unique so a handoff retry
-- can never open a second intake for the same return.

-- AlterTable
ALTER TABLE "mm_customer_returns" ADD COLUMN "sdSalesReturnId" TEXT;
ALTER TABLE "mm_customer_returns" ADD COLUMN "damageReportId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "mm_customer_returns_sdSalesReturnId_key" ON "mm_customer_returns"("sdSalesReturnId");

-- CreateIndex
CREATE INDEX "mm_customer_returns_damageReportId_idx" ON "mm_customer_returns"("damageReportId");

-- AddForeignKey
ALTER TABLE "mm_customer_returns" ADD CONSTRAINT "mm_customer_returns_sdSalesReturnId_fkey" FOREIGN KEY ("sdSalesReturnId") REFERENCES "sd_sales_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mm_customer_returns" ADD CONSTRAINT "mm_customer_returns_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_sales_returns" ADD CONSTRAINT "sd_sales_returns_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
