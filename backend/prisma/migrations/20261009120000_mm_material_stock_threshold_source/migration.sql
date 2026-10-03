-- Stock thresholds on material master = source for SD product catalog / ecommerce
ALTER TABLE "mm_materials" ADD COLUMN IF NOT EXISTS "onHandQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_materials" ADD COLUMN IF NOT EXISTS "reservedQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
