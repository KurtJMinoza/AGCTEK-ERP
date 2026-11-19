-- Ocular runs are SCM trips (trip-first). CRM no longer has an OCULAR activity type:
-- drop the CRM ocular columns and the trip/stop -> CRM activity links, add lead/customer
-- links on stops and an origin reference on leads (source = 'OCULAR').

-- CRM activity: ocular fields (no OCULAR rows existed when this ran)
DELETE FROM "crm_activities" WHERE "type" = 'OCULAR';
DROP INDEX IF EXISTS "crm_activities_type_dueAt_idx";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "siteAddress";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "siteLat";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "siteLng";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "outcomeNotes";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "vehicleRequired";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "vehicleRequestNotes";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "vehicleWindowStart";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "vehicleWindowEnd";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "preferredVehicleId";
ALTER TABLE "crm_activities" DROP COLUMN IF EXISTS "vehicleRequestStatus";
CREATE INDEX IF NOT EXISTS "crm_activities_type_dueAt_idx" ON "crm_activities"("type", "dueAt");

-- Trip / stop: remove the CRM activity link
DROP INDEX IF EXISTS "Trip_crmActivityId_key";
ALTER TABLE "Trip" DROP COLUMN IF EXISTS "crmActivityId";
DROP INDEX IF EXISTS "TripStop_crmActivityId_key";
ALTER TABLE "TripStop" DROP COLUMN IF EXISTS "crmActivityId";

-- Stop: known account visited / lead captured here (soft references)
ALTER TABLE "TripStop" ADD COLUMN IF NOT EXISTS "existingLeadId" TEXT;
ALTER TABLE "TripStop" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "TripStop" ADD COLUMN IF NOT EXISTS "createdLeadId" TEXT;

-- Lead: where it was captured
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "originTripStopId" TEXT;
