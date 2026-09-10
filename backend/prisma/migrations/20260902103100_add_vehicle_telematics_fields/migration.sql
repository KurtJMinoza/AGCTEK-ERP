-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "telematicsDeviceId" TEXT;

-- AlterTable
ALTER TABLE "GpsLog" ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;
