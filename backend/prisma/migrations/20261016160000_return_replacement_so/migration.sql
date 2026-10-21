-- Phase 4: Customer Return approve → optional replacement sales order (new outbound).
ALTER TABLE "sd_return_requests"
  ADD COLUMN IF NOT EXISTS "replacementSalesOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_return_requests_replacementSalesOrderId_key"
  ON "sd_return_requests" ("replacementSalesOrderId");
