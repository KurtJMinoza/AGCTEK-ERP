-- Phase 2C: BOM explosion traces and demand split on material requirements

ALTER TABLE "mm_material_requirement"
  ADD COLUMN IF NOT EXISTS "independentDemandQty" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "bomDependentDemandQty" DECIMAL(65,30);

CREATE TABLE "mm_bom_explosion_trace" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "parentMaterialId" TEXT NOT NULL,
    "componentMaterialId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "demandDate" TIMESTAMP(3),
    "parentDemandQty" DECIMAL(65,30) NOT NULL,
    "quantityPer" DECIMAL(65,30) NOT NULL,
    "grossComponentQty" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT,
    "yieldFactor" DECIMAL(65,30),
    "scrapFactor" DECIMAL(65,30),
    "explosionReason" TEXT,
    "warningCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mm_bom_explosion_trace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mm_bom_explosion_trace_mrpRunId_idx"
    ON "mm_bom_explosion_trace"("mrpRunId");
CREATE INDEX "mm_bom_explosion_trace_mrpRunId_componentMaterialId_idx"
    ON "mm_bom_explosion_trace"("mrpRunId", "componentMaterialId");
CREATE INDEX "mm_bom_explosion_trace_mrpRunId_parentMaterialId_idx"
    ON "mm_bom_explosion_trace"("mrpRunId", "parentMaterialId");

ALTER TABLE "mm_bom_explosion_trace"
    ADD CONSTRAINT "mm_bom_explosion_trace_mrpRunId_fkey"
    FOREIGN KEY ("mrpRunId") REFERENCES "mm_mrp_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_bom_explosion_trace"
    ADD CONSTRAINT "mm_bom_explosion_trace_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_bom_explosion_trace"
    ADD CONSTRAINT "mm_bom_explosion_trace_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_bom_explosion_trace"
    ADD CONSTRAINT "mm_bom_explosion_trace_parentMaterialId_fkey"
    FOREIGN KEY ("parentMaterialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_bom_explosion_trace"
    ADD CONSTRAINT "mm_bom_explosion_trace_componentMaterialId_fkey"
    FOREIGN KEY ("componentMaterialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
