-- Phase 10: Advanced MRP and Replenishment (planning output only — no inventory posting)

-- PlanningParameter fields on reorder rules (bridge)
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "minStock" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "maxStock" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "lotSize" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "reviewPeriodDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "planningStrategy" TEXT NOT NULL DEFAULT 'REORDER_POINT';
ALTER TABLE "mm_reorder_rule" ADD COLUMN IF NOT EXISTS "procurementType" TEXT NOT NULL DEFAULT 'BUY';

-- Demand cancel / plant scope
ALTER TABLE "mm_planning_demands" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "mm_planning_demands" ADD COLUMN IF NOT EXISTS "plantId" TEXT;
CREATE INDEX IF NOT EXISTS "mm_planning_demands_status_idx" ON "mm_planning_demands"("status");
CREATE INDEX IF NOT EXISTS "mm_planning_demands_plantId_idx" ON "mm_planning_demands"("plantId");

DO $$ BEGIN
  ALTER TABLE "mm_planning_demands"
    ADD CONSTRAINT "mm_planning_demands_plantId_fkey"
    FOREIGN KEY ("plantId") REFERENCES "plants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- MRP run lifecycle enrichment
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "plantId" TEXT;
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "parametersJson" JSONB;
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "resultsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "mm_mrp_run" ADD COLUMN IF NOT EXISTS "autoCreatePurchaseRequisitions" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "mm_mrp_run_plantId_idx" ON "mm_mrp_run"("plantId");

DO $$ BEGIN
  ALTER TABLE "mm_mrp_run"
    ADD CONSTRAINT "mm_mrp_run_plantId_fkey"
    FOREIGN KEY ("plantId") REFERENCES "plants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Normalize legacy PENDING → QUEUED for open runs
UPDATE "mm_mrp_run" SET "status" = 'QUEUED' WHERE "status" = 'PENDING';

-- MRPRequirement enrichment
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "grossDemand" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "projectedAvailable" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "plannedSupplyQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "productionSupplyQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "shortageQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "recommendedAction" TEXT;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "lotSize" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "minStock" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "maxStock" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "procurementType" TEXT;
ALTER TABLE "mm_material_requirement" ADD COLUMN IF NOT EXISTS "planningStrategy" TEXT;

-- Procurement suggestion explanation fields
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "demandSource" TEXT;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "shortageReason" TEXT;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "moq" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "lotSize" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "explanation" TEXT;
ALTER TABLE "mm_procurement_suggestions" ADD COLUMN IF NOT EXISTS "plannedOrderId" TEXT;

-- Planned orders (future-ready: Planned PO → PR, Planned Production → Prod req)
CREATE TABLE IF NOT EXISTS "mm_planned_orders" (
    "id" TEXT NOT NULL,
    "plannedOrderNumber" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "materialRequirementId" TEXT,
    "companyId" TEXT NOT NULL,
    "plantId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3),
    "procurementType" TEXT NOT NULL DEFAULT 'BUY',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "purchaseRequisitionId" TEXT,
    "sourceDemandIds" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_planned_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_planned_orders_plannedOrderNumber_key"
  ON "mm_planned_orders"("plannedOrderNumber");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_mrpRunId_idx" ON "mm_planned_orders"("mrpRunId");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_companyId_idx" ON "mm_planned_orders"("companyId");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_warehouseId_idx" ON "mm_planned_orders"("warehouseId");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_materialId_idx" ON "mm_planned_orders"("materialId");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_status_idx" ON "mm_planned_orders"("status");
CREATE INDEX IF NOT EXISTS "mm_planned_orders_orderType_idx" ON "mm_planned_orders"("orderType");

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_mrpRunId_fkey"
    FOREIGN KEY ("mrpRunId") REFERENCES "mm_mrp_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_materialRequirementId_fkey"
    FOREIGN KEY ("materialRequirementId") REFERENCES "mm_material_requirement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_plantId_fkey"
    FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_uomId_fkey"
    FOREIGN KEY ("uomId") REFERENCES "mm_uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_planned_orders"
    ADD CONSTRAINT "mm_planned_orders_purchaseRequisitionId_fkey"
    FOREIGN KEY ("purchaseRequisitionId") REFERENCES "mm_purchase_requisitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supply proposals (open planned supply counted in netting; not physical stock)
CREATE TABLE IF NOT EXISTS "mm_supply_proposals" (
    "id" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "plannedOrderId" TEXT,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplyType" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "availableDate" TIMESTAMP(3) NOT NULL,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_supply_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_supply_proposals_proposalNumber_key"
  ON "mm_supply_proposals"("proposalNumber");
CREATE INDEX IF NOT EXISTS "mm_supply_proposals_mrpRunId_idx" ON "mm_supply_proposals"("mrpRunId");
CREATE INDEX IF NOT EXISTS "mm_supply_proposals_companyId_warehouseId_materialId_idx"
  ON "mm_supply_proposals"("companyId", "warehouseId", "materialId");
CREATE INDEX IF NOT EXISTS "mm_supply_proposals_status_idx" ON "mm_supply_proposals"("status");

DO $$ BEGIN
  ALTER TABLE "mm_supply_proposals"
    ADD CONSTRAINT "mm_supply_proposals_mrpRunId_fkey"
    FOREIGN KEY ("mrpRunId") REFERENCES "mm_mrp_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_supply_proposals"
    ADD CONSTRAINT "mm_supply_proposals_plannedOrderId_fkey"
    FOREIGN KEY ("plannedOrderId") REFERENCES "mm_planned_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_supply_proposals"
    ADD CONSTRAINT "mm_supply_proposals_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_supply_proposals"
    ADD CONSTRAINT "mm_supply_proposals_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_supply_proposals"
    ADD CONSTRAINT "mm_supply_proposals_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mm_procurement_suggestions"
    ADD CONSTRAINT "mm_procurement_suggestions_plannedOrderId_fkey"
    FOREIGN KEY ("plannedOrderId") REFERENCES "mm_planned_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
