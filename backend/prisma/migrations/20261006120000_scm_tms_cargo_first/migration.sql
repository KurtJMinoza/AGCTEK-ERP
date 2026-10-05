-- Cargo-first TMS: ShipmentLine, LoadPlan/LoadPlanLine, TripStopLine, stop types (additive only)

ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'DISPATCHED';

CREATE TYPE "LoadPlanStatus" AS ENUM ('DRAFT', 'VALIDATED', 'READY', 'ASSIGNED', 'DISPATCHED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TripStopType" AS ENUM ('SHIP', 'TO', 'RETURN');

-- ShipmentLine
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialCode" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumeM3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packageItemId" TEXT,
    "shipFromWarehouseId" TEXT,
    "shipFromAddress" TEXT,
    "shipFromLat" DOUBLE PRECISION,
    "shipFromLng" DOUBLE PRECISION,
    "shipToAddress" TEXT NOT NULL,
    "shipToLat" DOUBLE PRECISION,
    "shipToLng" DOUBLE PRECISION,
    "returnWarehouseId" TEXT,
    "returnAddress" TEXT,
    "returnLat" DOUBLE PRECISION,
    "returnLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShipmentLine_shipmentId_lineNo_key" ON "ShipmentLine"("shipmentId", "lineNo");
CREATE INDEX "ShipmentLine_shipFromWarehouseId_idx" ON "ShipmentLine"("shipFromWarehouseId");

ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey"
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipFromWarehouseId_fkey"
    FOREIGN KEY ("shipFromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_returnWarehouseId_fkey"
    FOREIGN KEY ("returnWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one line per existing shipment (ship-from = package warehouse when known)
INSERT INTO "ShipmentLine" (
    "id", "shipmentId", "lineNo", "materialCode", "description", "quantity", "weightKg", "volumeM3",
    "shipFromWarehouseId", "shipFromAddress", "shipFromLat", "shipFromLng",
    "shipToAddress", "shipToLat", "shipToLng", "createdAt", "updatedAt"
)
SELECT
    'sl_' || s."id", s."id", 1, s."materialCode", s."description", s."quantity", s."weightKg", s."volumeM3",
    p."warehouseId", s."originAddress", s."originLat", s."originLng",
    s."destAddress", s."destLat", s."destLng", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Shipment" s
LEFT JOIN "wm_packages" p ON p."id" = s."packageId";

-- LoadPlan
CREATE TABLE "LoadPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "LoadPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "totalWeightKg" DOUBLE PRECISION,
    "totalVolumeM3" DOUBLE PRECISION,
    "notes" TEXT,
    "createdBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoadPlan_code_key" ON "LoadPlan"("code");
CREATE INDEX "LoadPlan_vehicleId_status_idx" ON "LoadPlan"("vehicleId", "status");
CREATE INDEX "LoadPlan_status_idx" ON "LoadPlan"("status");
-- MVP: one active load plan per vehicle
CREATE UNIQUE INDEX "LoadPlan_vehicle_active_key" ON "LoadPlan"("vehicleId")
    WHERE "status" IN ('DRAFT', 'VALIDATED', 'READY', 'ASSIGNED', 'DISPATCHED');

ALTER TABLE "LoadPlan" ADD CONSTRAINT "LoadPlan_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LoadPlanLine
CREATE TABLE "LoadPlanLine" (
    "id" TEXT NOT NULL,
    "loadPlanId" TEXT NOT NULL,
    "shipmentLineId" TEXT NOT NULL,
    "assignedQty" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadPlanLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoadPlanLine_shipmentLineId_key" ON "LoadPlanLine"("shipmentLineId");
CREATE INDEX "LoadPlanLine_loadPlanId_idx" ON "LoadPlanLine"("loadPlanId");

ALTER TABLE "LoadPlanLine" ADD CONSTRAINT "LoadPlanLine_loadPlanId_fkey"
    FOREIGN KEY ("loadPlanId") REFERENCES "LoadPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoadPlanLine" ADD CONSTRAINT "LoadPlanLine_shipmentLineId_fkey"
    FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trip
ALTER TABLE "Trip"
    ADD COLUMN "loadPlanId" TEXT,
    ADD COLUMN "plannedEndAt" TIMESTAMP(3),
    ADD COLUMN "dispatchedAt" TIMESTAMP(3);

CREATE INDEX "Trip_loadPlanId_idx" ON "Trip"("loadPlanId");
-- MVP: one non-cancelled trip per load plan
CREATE UNIQUE INDEX "Trip_loadPlan_active_key" ON "Trip"("loadPlanId")
    WHERE "loadPlanId" IS NOT NULL AND "status" <> 'CANCELLED';

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_loadPlanId_fkey"
    FOREIGN KEY ("loadPlanId") REFERENCES "LoadPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TripStop
ALTER TABLE "TripStop"
    ADD COLUMN "stopType" "TripStopType",
    ADD COLUMN "locationKey" TEXT,
    ADD COLUMN "warehouseId" TEXT;

ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TripStopLine
CREATE TABLE "TripStopLine" (
    "id" TEXT NOT NULL,
    "tripStopId" TEXT NOT NULL,
    "loadPlanLineId" TEXT NOT NULL,
    "shipmentLineId" TEXT NOT NULL,

    CONSTRAINT "TripStopLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripStopLine_tripStopId_loadPlanLineId_key" ON "TripStopLine"("tripStopId", "loadPlanLineId");
CREATE INDEX "TripStopLine_loadPlanLineId_idx" ON "TripStopLine"("loadPlanLineId");
CREATE INDEX "TripStopLine_shipmentLineId_idx" ON "TripStopLine"("shipmentLineId");

ALTER TABLE "TripStopLine" ADD CONSTRAINT "TripStopLine_tripStopId_fkey"
    FOREIGN KEY ("tripStopId") REFERENCES "TripStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripStopLine" ADD CONSTRAINT "TripStopLine_loadPlanLineId_fkey"
    FOREIGN KEY ("loadPlanLineId") REFERENCES "LoadPlanLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripStopLine" ADD CONSTRAINT "TripStopLine_shipmentLineId_fkey"
    FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
