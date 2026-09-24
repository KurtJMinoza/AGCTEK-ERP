-- Phase 1A: Enterprise Quality Management Domain

-- Inspection plans: scope + sampling
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "materialId" TEXT;
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "plantId" TEXT;
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "inspectionType" TEXT;
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "samplingType" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "sampleSize" DECIMAL(65,30);
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "samplePercent" DECIMAL(65,30);
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "allowFullInspection" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "mm_inspection_plans" ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);

-- Characteristics: categorical support
ALTER TABLE "mm_inspection_characteristics" ADD COLUMN IF NOT EXISTS "targetValue" TEXT;
ALTER TABLE "mm_inspection_characteristics" ADD COLUMN IF NOT EXISTS "categoryLabel" TEXT;
ALTER TABLE "mm_inspection_characteristics" ADD COLUMN IF NOT EXISTS "allowedValues" JSONB;

-- Inspection lots: enriched context + lifecycle
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "plantId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "receivingDocumentId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "serialNumberId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "sampleQuantity" DECIMAL(65,30);
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "samplingType" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "sourceDocumentType" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "assignedInspector" TEXT;
ALTER TABLE "mm_inspection_lots" ADD COLUMN IF NOT EXISTS "decidedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0;

UPDATE "mm_inspection_lots" SET "status" = 'CREATED' WHERE "status" = 'PENDING';
UPDATE "mm_inspection_lots" SET "status" = 'DECIDED' WHERE "status" = 'COMPLETED';
ALTER TABLE "mm_inspection_lots" ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- Results: explicit result field
ALTER TABLE "mm_inspection_results" ADD COLUMN IF NOT EXISTS "result" TEXT;

-- Defect codes master
CREATE TABLE IF NOT EXISTS "mm_defect_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "severityDefault" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_defect_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_defect_codes_companyId_code_key" ON "mm_defect_codes"("companyId", "code");
CREATE INDEX IF NOT EXISTS "mm_defect_codes_companyId_idx" ON "mm_defect_codes"("companyId");

ALTER TABLE "mm_inspection_defects" ADD COLUMN IF NOT EXISTS "defectCodeId" TEXT;
CREATE INDEX IF NOT EXISTS "mm_inspection_defects_defectCodeId_idx" ON "mm_inspection_defects"("defectCodeId");

-- Nonconformance
CREATE TABLE IF NOT EXISTS "mm_nonconformances" (
    "id" TEXT NOT NULL,
    "ncNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inspectionLotId" TEXT,
    "inspectionDefectId" TEXT,
    "cause" TEXT,
    "severity" TEXT,
    "affectedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "responsibleParty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdBy" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_nonconformances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_nonconformances_ncNumber_key" ON "mm_nonconformances"("ncNumber");
CREATE INDEX IF NOT EXISTS "mm_nonconformances_companyId_idx" ON "mm_nonconformances"("companyId");
CREATE INDEX IF NOT EXISTS "mm_nonconformances_inspectionLotId_idx" ON "mm_nonconformances"("inspectionLotId");
CREATE INDEX IF NOT EXISTS "mm_nonconformances_status_idx" ON "mm_nonconformances"("status");

-- Corrective actions
CREATE TABLE IF NOT EXISTS "mm_corrective_actions" (
    "id" TEXT NOT NULL,
    "actionNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nonconformanceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_corrective_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_corrective_actions_actionNumber_key" ON "mm_corrective_actions"("actionNumber");
CREATE INDEX IF NOT EXISTS "mm_corrective_actions_nonconformanceId_idx" ON "mm_corrective_actions"("nonconformanceId");
CREATE INDEX IF NOT EXISTS "mm_corrective_actions_companyId_idx" ON "mm_corrective_actions"("companyId");

-- Quality holds: hold type
ALTER TABLE "mm_quality_holds" ADD COLUMN IF NOT EXISTS "holdType" TEXT NOT NULL DEFAULT 'QUALITY_HOLD';
ALTER TABLE "mm_quality_holds" ADD COLUMN IF NOT EXISTS "targetStockStatus" TEXT;

-- Quality decisions: idempotency + reason
ALTER TABLE "mm_quality_decisions" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "mm_quality_decisions" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "mm_quality_decisions_idempotencyKey_key" ON "mm_quality_decisions"("idempotencyKey");

-- Attachments
CREATE TABLE IF NOT EXISTS "mm_quality_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_quality_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_quality_attachments_entityType_entityId_idx" ON "mm_quality_attachments"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "mm_quality_attachments_companyId_idx" ON "mm_quality_attachments"("companyId");

-- Workflow rules
CREATE TABLE IF NOT EXISTS "mm_quality_workflow_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "decisionCode" TEXT,
    "minQuantity" DECIMAL(65,30),
    "workflowId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_quality_workflow_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_quality_workflow_rules_companyId_entityType_idx" ON "mm_quality_workflow_rules"("companyId", "entityType");

-- Foreign keys (idempotent via DO blocks where needed)
DO $$ BEGIN
  ALTER TABLE "mm_inspection_plans" ADD CONSTRAINT "mm_inspection_plans_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_plans" ADD CONSTRAINT "mm_inspection_plans_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_plans" ADD CONSTRAINT "mm_inspection_plans_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "mm_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_receivingDocumentId_fkey" FOREIGN KEY ("receivingDocumentId") REFERENCES "mm_receiving_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "mm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "mm_serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_defect_codes" ADD CONSTRAINT "mm_defect_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_inspection_defects" ADD CONSTRAINT "mm_inspection_defects_defectCodeId_fkey" FOREIGN KEY ("defectCodeId") REFERENCES "mm_defect_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_nonconformances" ADD CONSTRAINT "mm_nonconformances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_nonconformances" ADD CONSTRAINT "mm_nonconformances_inspectionLotId_fkey" FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_nonconformances" ADD CONSTRAINT "mm_nonconformances_inspectionDefectId_fkey" FOREIGN KEY ("inspectionDefectId") REFERENCES "mm_inspection_defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_corrective_actions" ADD CONSTRAINT "mm_corrective_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_corrective_actions" ADD CONSTRAINT "mm_corrective_actions_nonconformanceId_fkey" FOREIGN KEY ("nonconformanceId") REFERENCES "mm_nonconformances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_quality_attachments" ADD CONSTRAINT "mm_quality_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mm_quality_workflow_rules" ADD CONSTRAINT "mm_quality_workflow_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "mm_inspection_lots_supplierId_idx" ON "mm_inspection_lots"("supplierId");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_purchaseOrderId_idx" ON "mm_inspection_lots"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_priority_idx" ON "mm_inspection_lots"("priority");
CREATE INDEX IF NOT EXISTS "mm_inspection_plans_materialId_idx" ON "mm_inspection_plans"("materialId");
CREATE INDEX IF NOT EXISTS "mm_inspection_plans_supplierId_idx" ON "mm_inspection_plans"("supplierId");
CREATE INDEX IF NOT EXISTS "mm_inspection_plans_plantId_idx" ON "mm_inspection_plans"("plantId");
