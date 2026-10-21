-- Phase 2: DamageReport evidence → SdReturnRequest (Customer Returns) commercial spine.
ALTER TABLE "sd_return_requests"
  ADD COLUMN IF NOT EXISTS "damageReportId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_return_requests_damageReportId_key"
  ON "sd_return_requests" ("damageReportId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sd_return_requests_damageReportId_fkey'
  ) THEN
    ALTER TABLE "sd_return_requests"
      ADD CONSTRAINT "sd_return_requests_damageReportId_fkey"
      FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
