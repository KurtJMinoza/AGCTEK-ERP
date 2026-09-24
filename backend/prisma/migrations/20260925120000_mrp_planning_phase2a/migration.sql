-- Phase 2A: Advanced MRP Planning Foundation

-- Extend planning parameters (MmReorderRule)
ALTER TABLE "mm_reorder_rule" ADD COLUMN "plantId" TEXT;
ALTER TABLE "mm_reorder_rule" ADD COLUMN "planningHorizonDays" INTEGER;
ALTER TABLE "mm_reorder_rule" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "mm_reorder_rule" ADD COLUMN "effectiveTo" TIMESTAMP(3);

ALTER TABLE "mm_reorder_rule" ADD CONSTRAINT "mm_reorder_rule_plantId_fkey"
  FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "mm_reorder_rule_plantId_idx" ON "mm_reorder_rule"("plantId");

-- Extend procurement suggestion explainability
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN "availableQuantity" DECIMAL(65,30);
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN "safetyStockQty" DECIMAL(65,30);
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN "incomingSupplyQty" DECIMAL(65,30);
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN "grossDemandQty" DECIMAL(65,30);
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN "planningRule" TEXT;

-- Time-phased projected stock per MRP run
CREATE TABLE "mm_projected_stock" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "openingQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "demandQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "supplyQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reservationQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mm_projected_stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mm_projected_stock_mrpRunId_warehouseId_materialId_bucketDate_key"
  ON "mm_projected_stock"("mrpRunId", "warehouseId", "materialId", "bucketDate");
CREATE INDEX "mm_projected_stock_mrpRunId_idx" ON "mm_projected_stock"("mrpRunId");
CREATE INDEX "mm_projected_stock_companyId_warehouseId_materialId_idx"
  ON "mm_projected_stock"("companyId", "warehouseId", "materialId");
CREATE INDEX "mm_projected_stock_bucketDate_idx" ON "mm_projected_stock"("bucketDate");

ALTER TABLE "mm_projected_stock" ADD CONSTRAINT "mm_projected_stock_mrpRunId_fkey"
  FOREIGN KEY ("mrpRunId") REFERENCES "mm_mrp_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_projected_stock" ADD CONSTRAINT "mm_projected_stock_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_projected_stock" ADD CONSTRAINT "mm_projected_stock_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_projected_stock" ADD CONSTRAINT "mm_projected_stock_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
