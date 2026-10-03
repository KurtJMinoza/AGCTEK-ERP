-- AlterTable
ALTER TABLE "sd_sales_orders" ADD COLUMN "shipToName" TEXT,
ADD COLUMN "shipToPhone" TEXT,
ADD COLUMN "shipToAddressLine1" TEXT,
ADD COLUMN "shipToCity" TEXT,
ADD COLUMN "shipToRegion" TEXT,
ADD COLUMN "shipToPostalCode" TEXT,
ADD COLUMN "shipToCountry" TEXT;
