-- SD Customer Master: RETAIL (e-commerce) vs B2B customers; RETAIL customers link to a storefront login.
-- Existing customers were all registered as B2B accounts.

-- AlterTable
ALTER TABLE "sd_customers" ADD COLUMN     "customerType" TEXT NOT NULL DEFAULT 'B2B',
ADD COLUMN     "retailClientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sd_customers_retailClientId_key" ON "sd_customers"("retailClientId");

-- CreateIndex
CREATE INDEX "sd_customers_customerType_idx" ON "sd_customers"("customerType");

-- AddForeignKey
ALTER TABLE "sd_customers" ADD CONSTRAINT "sd_customers_retailClientId_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
