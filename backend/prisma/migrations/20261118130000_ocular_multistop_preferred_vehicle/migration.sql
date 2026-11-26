-- Ocular: preferred vehicle on CRM request; per-stop CRM activity link for multi-stop ocular trips

ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "preferredVehicleId" TEXT;

ALTER TABLE "TripStop" ADD COLUMN IF NOT EXISTS "crmActivityId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TripStop_crmActivityId_key" ON "TripStop"("crmActivityId");

-- Backfill single-stop ocular trips created before per-stop links
UPDATE "TripStop" ts
SET "crmActivityId" = t."crmActivityId"
FROM "Trip" t
WHERE ts."tripId" = t."id"
  AND t."purpose" = 'OCULAR'
  AND t."crmActivityId" IS NOT NULL
  AND ts."sequence" = 1
  AND ts."crmActivityId" IS NULL;
