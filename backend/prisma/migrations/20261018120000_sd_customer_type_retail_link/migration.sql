-- SD Customer Master: RETAIL (e-commerce) vs B2B customers.
-- The storefront link (retailClientId) comes from 20261013050000_sd_customer_shop_account_link.

-- AlterTable
ALTER TABLE "sd_customers" ADD COLUMN "customerType" TEXT NOT NULL DEFAULT 'B2B';

-- Shop-linked customers without credit were created from storefront sign-ups.
UPDATE "sd_customers"
SET "customerType" = 'RETAIL'
WHERE "retailClientId" IS NOT NULL AND "creditLimit" = 0;

-- CreateIndex
CREATE INDEX "sd_customers_customerType_idx" ON "sd_customers"("customerType");
