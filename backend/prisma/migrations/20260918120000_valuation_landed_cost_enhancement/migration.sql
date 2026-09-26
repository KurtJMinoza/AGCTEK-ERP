-- Phase 9: Inventory Valuation + Landed Cost Enhancement

ALTER TABLE "mm_material_valuation" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "mm_material_valuation" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "mm_material_valuation" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "mm_material_valuation_isActive_idx" ON "mm_material_valuation"("isActive");

ALTER TABLE "mm_landed_cost_lines" ADD COLUMN IF NOT EXISTS "costElementId" TEXT;
CREATE INDEX IF NOT EXISTS "mm_landed_cost_lines_costElementId_idx" ON "mm_landed_cost_lines"("costElementId");

CREATE TABLE IF NOT EXISTS "mm_cost_elements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_cost_elements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_cost_elements_companyId_code_key" ON "mm_cost_elements"("companyId", "code");
CREATE INDEX IF NOT EXISTS "mm_cost_elements_companyId_idx" ON "mm_cost_elements"("companyId");
CREATE INDEX IF NOT EXISTS "mm_cost_elements_costType_idx" ON "mm_cost_elements"("costType");
CREATE INDEX IF NOT EXISTS "mm_cost_elements_isActive_idx" ON "mm_cost_elements"("isActive");

DO $$ BEGIN
  ALTER TABLE "mm_cost_elements"
    ADD CONSTRAINT "mm_cost_elements_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_landed_cost_lines"
    ADD CONSTRAINT "mm_landed_cost_lines_costElementId_fkey"
    FOREIGN KEY ("costElementId") REFERENCES "mm_cost_elements"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mm_price_variances" (
    "id" TEXT NOT NULL,
    "varianceNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "valuationTxnId" TEXT,
    "inventoryTxnId" TEXT,
    "varianceType" TEXT NOT NULL,
    "poPrice" DECIMAL(65,30),
    "standardCost" DECIMAL(65,30),
    "invoicePrice" DECIMAL(65,30),
    "landedUnitCost" DECIMAL(65,30),
    "actualUnitCost" DECIMAL(65,30),
    "varianceAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_price_variances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_price_variances_varianceNumber_key" ON "mm_price_variances"("varianceNumber");
CREATE INDEX IF NOT EXISTS "mm_price_variances_companyId_idx" ON "mm_price_variances"("companyId");
CREATE INDEX IF NOT EXISTS "mm_price_variances_materialId_idx" ON "mm_price_variances"("materialId");
CREATE INDEX IF NOT EXISTS "mm_price_variances_warehouseId_idx" ON "mm_price_variances"("warehouseId");
CREATE INDEX IF NOT EXISTS "mm_price_variances_valuationTxnId_idx" ON "mm_price_variances"("valuationTxnId");
CREATE INDEX IF NOT EXISTS "mm_price_variances_varianceType_idx" ON "mm_price_variances"("varianceType");
CREATE INDEX IF NOT EXISTS "mm_price_variances_status_idx" ON "mm_price_variances"("status");

DO $$ BEGIN
  ALTER TABLE "mm_price_variances"
    ADD CONSTRAINT "mm_price_variances_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_price_variances"
    ADD CONSTRAINT "mm_price_variances_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_price_variances"
    ADD CONSTRAINT "mm_price_variances_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_price_variances"
    ADD CONSTRAINT "mm_price_variances_valuationTxnId_fkey"
    FOREIGN KEY ("valuationTxnId") REFERENCES "mm_inventory_valuation_transaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
