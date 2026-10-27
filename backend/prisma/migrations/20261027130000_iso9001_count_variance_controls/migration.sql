-- ISO 9001 inventory control: variance investigation + formal variance report on session

ALTER TABLE "mm_count_sessions"
ADD COLUMN IF NOT EXISTS "varianceReportNumber" TEXT,
ADD COLUMN IF NOT EXISTS "varianceReportSummary" TEXT,
ADD COLUMN IF NOT EXISTS "varianceReportSubmittedBy" TEXT,
ADD COLUMN IF NOT EXISTS "varianceReportSubmittedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_sessions_varianceReportNumber_key"
ON "mm_count_sessions"("varianceReportNumber");

ALTER TABLE "mm_count_variances"
ADD COLUMN IF NOT EXISTS "rootCause" TEXT,
ADD COLUMN IF NOT EXISTS "correctiveAction" TEXT,
ADD COLUMN IF NOT EXISTS "investigatedBy" TEXT,
ADD COLUMN IF NOT EXISTS "investigatedAt" TIMESTAMP(3);
