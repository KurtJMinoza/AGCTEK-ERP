-- SCM Couriers (3PL) Phase 1: execution mode on Shipment, carrier master, courier consignments + events.
-- See docs/SCM_COURIERS.md.

-- CreateEnum
CREATE TYPE "ShipmentExecutionMode" AS ENUM ('OWN_FLEET', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "CarrierIntegrationType" AS ENUM ('MANUAL', 'API');

-- CreateEnum
CREATE TYPE "CourierConsignmentStatus" AS ENUM ('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourierEventSource" AS ENUM ('MANUAL', 'WEBHOOK', 'POLL');

-- AlterTable: every existing shipment is own fleet
ALTER TABLE "Shipment" ADD COLUMN "executionMode" "ShipmentExecutionMode" NOT NULL DEFAULT 'OWN_FLEET';

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supportsCod" BOOLEAN NOT NULL DEFAULT false,
    "integrationType" "CarrierIntegrationType" NOT NULL DEFAULT 'MANUAL',
    "trackingUrlTemplate" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierConsignment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "externalBookingId" TEXT,
    "labelUrl" TEXT,
    "status" "CourierConsignmentStatus" NOT NULL DEFAULT 'BOOKED',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "podUrl" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierConsignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierConsignmentEvent" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "status" "CourierConsignmentStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CourierEventSource" NOT NULL DEFAULT 'MANUAL',
    "rawStatus" TEXT,
    "note" TEXT,
    "payload" JSONB,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierConsignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_code_key" ON "Carrier"("code");

-- CreateIndex
CREATE INDEX "Carrier_isActive_idx" ON "Carrier"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CourierConsignment_shipmentId_key" ON "CourierConsignment"("shipmentId");

-- CreateIndex
CREATE INDEX "CourierConsignment_status_idx" ON "CourierConsignment"("status");

-- CreateIndex
CREATE INDEX "CourierConsignment_carrierId_status_idx" ON "CourierConsignment"("carrierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourierConsignment_carrierId_trackingNumber_key" ON "CourierConsignment"("carrierId", "trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CourierConsignmentEvent_idempotencyKey_key" ON "CourierConsignmentEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CourierConsignmentEvent_consignmentId_occurredAt_idx" ON "CourierConsignmentEvent"("consignmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "Shipment_executionMode_status_idx" ON "Shipment"("executionMode", "status");

-- AddForeignKey
ALTER TABLE "CourierConsignment" ADD CONSTRAINT "CourierConsignment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierConsignment" ADD CONSTRAINT "CourierConsignment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierConsignmentEvent" ADD CONSTRAINT "CourierConsignmentEvent_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "CourierConsignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: PH parcel couriers, all MANUAL with COD off until remittance (Phase 5).
INSERT INTO "Carrier" ("id", "code", "name", "isActive", "supportsCod", "integrationType", "updatedAt") VALUES
    ('carrier_jnt', 'JNT', 'J&T Express', true, false, 'MANUAL', CURRENT_TIMESTAMP),
    ('carrier_lbc', 'LBC', 'LBC Express', true, false, 'MANUAL', CURRENT_TIMESTAMP),
    ('carrier_ninjavan', 'NINJAVAN', 'Ninja Van', true, false, 'MANUAL', CURRENT_TIMESTAMP),
    ('carrier_flash', 'FLASH', 'Flash Express', true, false, 'MANUAL', CURRENT_TIMESTAMP),
    ('carrier_lalamove', 'LALAMOVE', 'Lalamove', true, false, 'MANUAL', CURRENT_TIMESTAMP),
    ('carrier_dhl', 'DHL', 'DHL Express', true, false, 'MANUAL', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
