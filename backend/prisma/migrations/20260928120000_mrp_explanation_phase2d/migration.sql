ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "explanationJson" JSONB;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "explanationJson" JSONB;
