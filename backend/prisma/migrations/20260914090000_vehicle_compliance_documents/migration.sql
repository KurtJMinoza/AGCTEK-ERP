-- CreateEnum
CREATE TYPE "VehicleDocumentKind" AS ENUM ('OR', 'CR', 'INSURANCE_CTPL', 'INSURANCE_COMPREHENSIVE', 'INSURANCE_OTHER');

-- CreateEnum
CREATE TYPE "VehicleDocumentStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VehicleDocument" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" "VehicleDocumentKind" NOT NULL,
    "documentNo" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "coverageNote" TEXT,
    "fileUrl" TEXT,
    "remindDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "blocksVehicle" BOOLEAN NOT NULL DEFAULT true,
    "status" "VehicleDocumentStatus" NOT NULL DEFAULT 'VALID',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleDocument_vehicleId_kind_idx" ON "VehicleDocument"("vehicleId", "kind");

-- CreateIndex
CREATE INDEX "VehicleDocument_status_expiresAt_idx" ON "VehicleDocument"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "VehicleDocument_expiresAt_idx" ON "VehicleDocument"("expiresAt");

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
