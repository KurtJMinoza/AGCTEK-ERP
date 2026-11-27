-- Material master default expiry + SD catalog variant override
ALTER TABLE "mm_materials" ADD COLUMN IF NOT EXISTS "defaultExpiryDate" DATE;
ALTER TABLE "sd_product_variants" ADD COLUMN IF NOT EXISTS "catalogExpiryDate" DATE;