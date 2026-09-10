-- CreateEnum
CREATE TYPE "ShipmentMovementType" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "movementType" "ShipmentMovementType" NOT NULL DEFAULT 'DELIVERY';

CREATE INDEX "Shipment_movementType_idx" ON "Shipment"("movementType");
