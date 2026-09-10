-- CreateEnum
CREATE TYPE "GeofenceKind" AS ENUM ('HUB', 'CHECKPOINT', 'ZONE');

-- CreateEnum
CREATE TYPE "GeofenceDetect" AS ENUM ('ENTER', 'EXIT', 'INSIDE', 'OUTSIDE');

-- CreateTable
CREATE TABLE "Geofence" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GeofenceKind" NOT NULL DEFAULT 'HUB',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceEvent" (
    "id" TEXT NOT NULL,
    "geofenceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "detect" "GeofenceDetect" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "rawPayload" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeofenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Geofence_code_key" ON "Geofence"("code");

-- CreateIndex
CREATE INDEX "Geofence_active_idx" ON "Geofence"("active");

-- CreateIndex
CREATE INDEX "Geofence_kind_idx" ON "Geofence"("kind");

-- CreateIndex
CREATE INDEX "GeofenceEvent_geofenceId_detectedAt_idx" ON "GeofenceEvent"("geofenceId", "detectedAt");

-- CreateIndex
CREATE INDEX "GeofenceEvent_vehicleId_detectedAt_idx" ON "GeofenceEvent"("vehicleId", "detectedAt");

-- AddForeignKey
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
