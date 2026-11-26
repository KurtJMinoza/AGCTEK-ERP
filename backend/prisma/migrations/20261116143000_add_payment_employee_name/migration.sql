-- Snapshot employee full name on salary-deduction tenders (display / reporting).
ALTER TABLE "sd_sales_order_payments" ADD COLUMN IF NOT EXISTS "employeeName" TEXT;