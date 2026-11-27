ALTER TABLE "sd_payment_methods"
ADD COLUMN IF NOT EXISTS "merchantFeeRate" DECIMAL(9, 4),
ADD COLUMN IF NOT EXISTS "merchantFeeFlat" DECIMAL(18, 4);