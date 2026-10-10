-- Record the operator responsible for each physical packing scan. The name is
-- a display snapshot so packing history remains readable if the user's profile
-- changes later. IF NOT EXISTS also makes this safe for databases where the
-- columns were introduced manually while the original migration was absent.
ALTER TABLE "wm_package_items"
    ADD COLUMN IF NOT EXISTS "packedById" TEXT,
    ADD COLUMN IF NOT EXISTS "packedByName" TEXT;
