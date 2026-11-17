-- Phase 1: MM Material Master owns product tax classification.
-- Non-destructive: new nullable columns + append-only history table only.

ALTER TABLE "mm_materials"
    ADD COLUMN "taxClassification" TEXT,
    ADD COLUMN "taxCodeId" TEXT,
    ADD COLUMN "priceTaxTreatment" TEXT,
    ADD COLUMN "taxStatus" TEXT,
    ADD COLUMN "taxEffectiveFrom" DATE,
    ADD COLUMN "taxEffectiveTo" DATE,
    ADD COLUMN "taxDescription" TEXT;

CREATE INDEX "mm_materials_taxCodeId_idx" ON "mm_materials"("taxCodeId");
CREATE INDEX "mm_materials_companyId_taxClassification_idx" ON "mm_materials"("companyId", "taxClassification");

ALTER TABLE "mm_materials"
    ADD CONSTRAINT "mm_materials_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mm_material_tax_history" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "companyId" TEXT,
    "taxClassification" TEXT,
    "taxCodeId" TEXT,
    "taxCodeValue" TEXT,
    "taxCodeName" TEXT,
    "taxType" TEXT,
    "taxRate" DECIMAL(18,6),
    "rateUnit" TEXT,
    "priceTaxTreatment" TEXT,
    "taxStatus" TEXT,
    "taxEffectiveFrom" DATE,
    "taxEffectiveTo" DATE,
    "taxDescription" TEXT,
    "changeType" TEXT NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mm_material_tax_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mm_material_tax_history_materialId_createdAt_idx" ON "mm_material_tax_history"("materialId", "createdAt");
CREATE INDEX "mm_material_tax_history_companyId_createdAt_idx" ON "mm_material_tax_history"("companyId", "createdAt");
CREATE INDEX "mm_material_tax_history_taxCodeId_idx" ON "mm_material_tax_history"("taxCodeId");

ALTER TABLE "mm_material_tax_history"
    ADD CONSTRAINT "mm_material_tax_history_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mm_material_tax_history"
    ADD CONSTRAINT "mm_material_tax_history_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mm_material_tax_history"
    ADD CONSTRAINT "mm_material_tax_history_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
