-- AlterTable
ALTER TABLE "companies" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "companies" ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "companies" ADD COLUMN "tin" TEXT NOT NULL DEFAULT '';
