-- Trip stop execution hardening: failure reason codes, shipment exception hold,
-- out-of-order override, append-only TripStopEvent audit.

-- CreateEnum
CREATE TYPE "DeliveryFailureReason" AS ENUM ('CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS', 'DAMAGED_GOODS', 'VEHICLE_ISSUE', 'PAYMENT_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "TripStopEventType" AS ENUM ('ARRIVED', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'EXCEPTION_HOLD';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "exceptionAt" TIMESTAMP(3),
ADD COLUMN     "exceptionCode" "DeliveryFailureReason",
ADD COLUMN     "exceptionNote" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "allowOutOfOrder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TripStop" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureCode" "DeliveryFailureReason";

-- CreateTable
CREATE TABLE "TripStopEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "eventType" "TripStopEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "deviceId" TEXT,
    "reasonCode" "DeliveryFailureReason",
    "notes" TEXT,
    "clientActionId" TEXT,

    CONSTRAINT "TripStopEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripStopEvent_clientActionId_key" ON "TripStopEvent"("clientActionId");

-- CreateIndex
CREATE INDEX "TripStopEvent_tripId_idx" ON "TripStopEvent"("tripId");

-- CreateIndex
CREATE INDEX "TripStopEvent_stopId_idx" ON "TripStopEvent"("stopId");

-- CreateIndex
CREATE INDEX "TripStopEvent_occurredAt_idx" ON "TripStopEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "TripStopEvent" ADD CONSTRAINT "TripStopEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStopEvent" ADD CONSTRAINT "TripStopEvent_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TripStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
