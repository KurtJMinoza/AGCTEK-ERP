-- ISO 9001 outbound flow: supervisor GI verification, formal packing list, label audit

ALTER TABLE "mm_goods_issues"
ADD COLUMN IF NOT EXISTS "supervisorVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "supervisorVerifiedBy" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedSourceReference" TEXT,
ADD COLUMN IF NOT EXISTS "supervisorVerificationNotes" TEXT;

ALTER TABLE "wm_packages"
ADD COLUMN IF NOT EXISTS "packingListNumber" TEXT,
ADD COLUMN IF NOT EXISTS "labelsAppliedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "wm_packages_packingListNumber_key"
ON "wm_packages"("packingListNumber");
