-- Each checkout has one authoritative payment record. This makes checkout
-- retries and payment verification safe under concurrent requests.
CREATE UNIQUE INDEX "sd_sales_order_payments_salesOrderId_key"
ON "sd_sales_order_payments"("salesOrderId");

-- The unique index also serves payment lookups by salesOrderId.
DROP INDEX IF EXISTS "sd_sales_order_payments_salesOrderId_idx";
