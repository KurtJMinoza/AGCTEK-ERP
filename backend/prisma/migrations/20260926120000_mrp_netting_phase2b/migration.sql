-- Phase 2B: TIME_PHASED bucket shortage fields on requirements and suggestions

ALTER TABLE "mm_material_requirement"
  ADD COLUMN IF NOT EXISTS "shortageDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "safetyStockViolationQty" DECIMAL(65,30);

ALTER TABLE "mm_procurement_suggestions"
  ADD COLUMN IF NOT EXISTS "shortageDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "projectedClosingQty" DECIMAL(65,30);
