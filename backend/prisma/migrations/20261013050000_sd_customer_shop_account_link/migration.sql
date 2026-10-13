-- SD Customer Master ↔ Shop account link (Add New Customer references Shop
-- sign-up accounts; shop sign-up auto-links by email).

-- AlterTable
ALTER TABLE "sd_customers" ADD COLUMN     "retailClientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sd_customers_retailClientId_key" ON "sd_customers"("retailClientId");

-- AddForeignKey
ALTER TABLE "sd_customers" ADD CONSTRAINT "sd_customers_retailClientId_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;