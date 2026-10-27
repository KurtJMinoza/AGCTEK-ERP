-- ISO 9001 returns & disposal: intake receipt traceability, disposal execution evidence

ALTER TABLE "mm_customer_return_intakes"
  ADD COLUMN IF NOT EXISTS "returnReceiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "intakePostedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_customer_return_intakes_returnReceiptNumber_key"
  ON "mm_customer_return_intakes"("returnReceiptNumber")
  WHERE "returnReceiptNumber" IS NOT NULL;

ALTER TABLE "mm_customer_return_lines"
  ADD COLUMN IF NOT EXISTS "intakeTxnId" TEXT;

ALTER TABLE "mm_disposals"
  ADD COLUMN IF NOT EXISTS "executedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "executedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "witnessName" TEXT,
  ADD COLUMN IF NOT EXISTS "disposalMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "wasteManifestRef" TEXT,
  ADD COLUMN IF NOT EXISTS "executionNotes" TEXT;
