-- CreateTable
CREATE TABLE "retail_client_addresses" (
    "id" TEXT NOT NULL,
    "retailClientId" TEXT NOT NULL,
    "label" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'PH',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_client_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retail_client_addresses_retailClientId_idx" ON "retail_client_addresses"("retailClientId");

-- CreateIndex
CREATE INDEX "retail_client_addresses_retailClientId_isDefault_idx" ON "retail_client_addresses"("retailClientId", "isDefault");

-- AddForeignKey
ALTER TABLE "retail_client_addresses" ADD CONSTRAINT "retail_client_addresses_retailClientId_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;