-- Driver-sourced damage reports
ALTER TABLE "DamageReport" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "DamageReport" ADD COLUMN "tripStopId" TEXT;

-- SD sales return settlement (pay full vs credit)
ALTER TABLE "sd_sales_returns" ADD COLUMN "settlement" TEXT;
ALTER TABLE "sd_sales_returns" ADD COLUMN "settlementNote" TEXT;
ALTER TABLE "sd_sales_returns" ADD COLUMN "settledBy" TEXT;
ALTER TABLE "sd_sales_returns" ADD COLUMN "settledAt" TIMESTAMP(3);
ALTER TABLE "sd_sales_returns" ADD COLUMN "creditAmount" DECIMAL(65,30);
