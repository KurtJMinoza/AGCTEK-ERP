-- A POS sale can be voided after it was completed: the goods issue is
-- reversed, the tenders are cancelled and the sale is closed with a reason.
ALTER TABLE "sd_sales_orders"
    ADD COLUMN "voidedAt" TIMESTAMP(3),
    ADD COLUMN "voidedBy" TEXT,
    ADD COLUMN "voidReason" TEXT;

CREATE INDEX "sd_sales_orders_voidedAt_idx" ON "sd_sales_orders"("voidedAt");
