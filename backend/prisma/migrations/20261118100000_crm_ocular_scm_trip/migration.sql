-- CRM ocular activity fields + SCM Trip purpose / crmActivityId link

ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "siteAddress" TEXT;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "siteLat" DOUBLE PRECISION;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "siteLng" DOUBLE PRECISION;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "outcomeNotes" TEXT;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "vehicleRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "vehicleRequestNotes" TEXT;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "vehicleWindowStart" TIMESTAMP(3);
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "vehicleWindowEnd" TIMESTAMP(3);
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "vehicleRequestStatus" TEXT NOT NULL DEFAULT 'NONE';

CREATE INDEX IF NOT EXISTS "crm_activities_type_dueAt_idx" ON "crm_activities"("type", "dueAt");

ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "crmActivityId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Trip_crmActivityId_key" ON "Trip"("crmActivityId");
CREATE INDEX IF NOT EXISTS "Trip_purpose_status_idx" ON "Trip"("purpose", "status");
