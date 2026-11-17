-- Add serialTrackingPolicy to mm_materials
-- Values: NOT_SERIALIZED | SERIALIZED_AT_RECEIPT | SERIALIZED_AT_ISSUE | SERIALIZED_AT_BOTH
-- Existing materials default to NOT_SERIALIZED (backward compatible)

ALTER TABLE "mm_materials"
ADD COLUMN "serialTrackingPolicy" TEXT NOT NULL DEFAULT 'NOT_SERIALIZED';

CREATE INDEX IF NOT EXISTS "mm_materials_serialTrackingPolicy_idx" ON "mm_materials"("serialTrackingPolicy");
