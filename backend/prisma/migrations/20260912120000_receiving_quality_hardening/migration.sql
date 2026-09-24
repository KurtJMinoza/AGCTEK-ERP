-- Receiving + Quality Management (MM-07 Phase 3)

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "qualityInspectionRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mm_suppliers" ADD COLUMN IF NOT EXISTS "qualityInspectionRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mm_supplier_materials" ADD COLUMN IF NOT EXISTS "inspectionRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "mm_asns" ADD COLUMN IF NOT EXISTS "supplierReference" TEXT;
ALTER TABLE "mm_asns" ADD COLUMN IF NOT EXISTS "packageCount" INTEGER;

ALTER TABLE "mm_asn_lines" ADD COLUMN IF NOT EXISTS "packageType" TEXT;
ALTER TABLE "mm_asn_lines" ADD COLUMN IF NOT EXISTS "grossWeight" DECIMAL(65,30);

ALTER TABLE "mm_goods_receipts" ADD COLUMN IF NOT EXISTS "receivingDocumentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "mm_goods_receipts_receivingDocumentId_key" ON "mm_goods_receipts"("receivingDocumentId");

CREATE TABLE IF NOT EXISTS "mm_receiving_documents" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expectedReceiptId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "asnId" TEXT,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "receiverId" TEXT,
    "postingDate" TIMESTAMP(3),
    "documentDate" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "goodsReceiptId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_receiving_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_receiving_documents_documentNumber_key" ON "mm_receiving_documents"("documentNumber");
CREATE INDEX IF NOT EXISTS "mm_receiving_documents_status_idx" ON "mm_receiving_documents"("status");
CREATE INDEX IF NOT EXISTS "mm_receiving_documents_expectedReceiptId_idx" ON "mm_receiving_documents"("expectedReceiptId");
CREATE INDEX IF NOT EXISTS "mm_receiving_documents_companyId_idx" ON "mm_receiving_documents"("companyId");

ALTER TABLE "mm_receiving_documents" ADD CONSTRAINT "mm_receiving_documents_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_receiving_documents" ADD CONSTRAINT "mm_receiving_documents_expectedReceiptId_fkey"
  FOREIGN KEY ("expectedReceiptId") REFERENCES "mm_expected_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_receiving_documents" ADD CONSTRAINT "mm_receiving_documents_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_receiving_lines" (
    "id" TEXT NOT NULL,
    "receivingDocumentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "expectedReceiptLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(65,30) NOT NULL,
    "damagedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "uomId" TEXT NOT NULL,
    "storageBinId" TEXT,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "remarks" TEXT,
    CONSTRAINT "mm_receiving_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_receiving_lines_receivingDocumentId_idx" ON "mm_receiving_lines"("receivingDocumentId");
CREATE INDEX IF NOT EXISTS "mm_receiving_lines_expectedReceiptLineId_idx" ON "mm_receiving_lines"("expectedReceiptLineId");

ALTER TABLE "mm_receiving_lines" ADD CONSTRAINT "mm_receiving_lines_receivingDocumentId_fkey"
  FOREIGN KEY ("receivingDocumentId") REFERENCES "mm_receiving_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_receiving_lines" ADD CONSTRAINT "mm_receiving_lines_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_receiving_lines" ADD CONSTRAINT "mm_receiving_lines_uomId_fkey"
  FOREIGN KEY ("uomId") REFERENCES "mm_uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_receiving_variances" (
    "id" TEXT NOT NULL,
    "receivingDocumentId" TEXT NOT NULL,
    "receivingLineId" TEXT,
    "varianceType" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    CONSTRAINT "mm_receiving_variances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_receiving_variances_receivingDocumentId_idx" ON "mm_receiving_variances"("receivingDocumentId");
CREATE INDEX IF NOT EXISTS "mm_receiving_variances_varianceType_idx" ON "mm_receiving_variances"("varianceType");
CREATE INDEX IF NOT EXISTS "mm_receiving_variances_status_idx" ON "mm_receiving_variances"("status");

ALTER TABLE "mm_receiving_variances" ADD CONSTRAINT "mm_receiving_variances_receivingDocumentId_fkey"
  FOREIGN KEY ("receivingDocumentId") REFERENCES "mm_receiving_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_receiving_variances" ADD CONSTRAINT "mm_receiving_variances_receivingLineId_fkey"
  FOREIGN KEY ("receivingLineId") REFERENCES "mm_receiving_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mm_goods_receipts" ADD CONSTRAINT "mm_goods_receipts_receivingDocumentId_fkey"
  FOREIGN KEY ("receivingDocumentId") REFERENCES "mm_receiving_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_plans" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialCategoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inspection_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_inspection_plans_planCode_key" ON "mm_inspection_plans"("planCode");
CREATE INDEX IF NOT EXISTS "mm_inspection_plans_companyId_idx" ON "mm_inspection_plans"("companyId");

ALTER TABLE "mm_inspection_plans" ADD CONSTRAINT "mm_inspection_plans_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_plans" ADD CONSTRAINT "mm_inspection_plans_materialCategoryId_fkey"
  FOREIGN KEY ("materialCategoryId") REFERENCES "mm_material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_characteristics" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'NUMERIC',
    "toleranceMin" DECIMAL(65,30),
    "toleranceMax" DECIMAL(65,30),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "unit" TEXT,
    CONSTRAINT "mm_inspection_characteristics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_inspection_characteristics_planId_idx" ON "mm_inspection_characteristics"("planId");

ALTER TABLE "mm_inspection_characteristics" ADD CONSTRAINT "mm_inspection_characteristics_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "mm_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_lots" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "planId" TEXT,
    "legacyQualityInspectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "inspectedBy" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inspection_lots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_inspection_lots_lotNumber_key" ON "mm_inspection_lots"("lotNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_inspection_lots_legacyQualityInspectionId_key" ON "mm_inspection_lots"("legacyQualityInspectionId");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_status_idx" ON "mm_inspection_lots"("status");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_goodsReceiptId_idx" ON "mm_inspection_lots"("goodsReceiptId");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_goodsReceiptLineId_idx" ON "mm_inspection_lots"("goodsReceiptLineId");
CREATE INDEX IF NOT EXISTS "mm_inspection_lots_companyId_idx" ON "mm_inspection_lots"("companyId");

ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_goodsReceiptId_fkey"
  FOREIGN KEY ("goodsReceiptId") REFERENCES "mm_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_lots" ADD CONSTRAINT "mm_inspection_lots_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "mm_inspection_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_samples" (
    "id" TEXT NOT NULL,
    "inspectionLotId" TEXT NOT NULL,
    "sampleNumber" INTEGER NOT NULL DEFAULT 1,
    "sampleSize" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_inspection_samples_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_inspection_samples_inspectionLotId_idx" ON "mm_inspection_samples"("inspectionLotId");

ALTER TABLE "mm_inspection_samples" ADD CONSTRAINT "mm_inspection_samples_inspectionLotId_fkey"
  FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_results" (
    "id" TEXT NOT NULL,
    "inspectionLotId" TEXT NOT NULL,
    "sampleId" TEXT,
    "characteristicId" TEXT,
    "measuredValue" TEXT,
    "numericValue" DECIMAL(65,30),
    "passed" BOOLEAN,
    "notes" TEXT,
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_inspection_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_inspection_results_inspectionLotId_idx" ON "mm_inspection_results"("inspectionLotId");

ALTER TABLE "mm_inspection_results" ADD CONSTRAINT "mm_inspection_results_inspectionLotId_fkey"
  FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_results" ADD CONSTRAINT "mm_inspection_results_sampleId_fkey"
  FOREIGN KEY ("sampleId") REFERENCES "mm_inspection_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mm_inspection_results" ADD CONSTRAINT "mm_inspection_results_characteristicId_fkey"
  FOREIGN KEY ("characteristicId") REFERENCES "mm_inspection_characteristics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_inspection_defects" (
    "id" TEXT NOT NULL,
    "inspectionLotId" TEXT NOT NULL,
    "defectCode" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "severity" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_inspection_defects_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_inspection_defects_inspectionLotId_idx" ON "mm_inspection_defects"("inspectionLotId");

ALTER TABLE "mm_inspection_defects" ADD CONSTRAINT "mm_inspection_defects_inspectionLotId_fkey"
  FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_quality_holds" (
    "id" TEXT NOT NULL,
    "holdNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inspectionLotId" TEXT,
    "goodsReceiptLineId" TEXT,
    "materialId" TEXT,
    "warehouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "heldBy" TEXT,
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseNotes" TEXT,
    CONSTRAINT "mm_quality_holds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mm_quality_holds_holdNumber_key" ON "mm_quality_holds"("holdNumber");
CREATE INDEX IF NOT EXISTS "mm_quality_holds_status_idx" ON "mm_quality_holds"("status");
CREATE INDEX IF NOT EXISTS "mm_quality_holds_inspectionLotId_idx" ON "mm_quality_holds"("inspectionLotId");
CREATE INDEX IF NOT EXISTS "mm_quality_holds_companyId_idx" ON "mm_quality_holds"("companyId");

ALTER TABLE "mm_quality_holds" ADD CONSTRAINT "mm_quality_holds_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_quality_holds" ADD CONSTRAINT "mm_quality_holds_inspectionLotId_fkey"
  FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mm_quality_decisions" (
    "id" TEXT NOT NULL,
    "inspectionLotId" TEXT NOT NULL,
    "decisionCode" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "deviationReason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetStockStatus" TEXT,
    "supplierReturnId" TEXT,
    "notes" TEXT,
    CONSTRAINT "mm_quality_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mm_quality_decisions_inspectionLotId_idx" ON "mm_quality_decisions"("inspectionLotId");

ALTER TABLE "mm_quality_decisions" ADD CONSTRAINT "mm_quality_decisions_inspectionLotId_fkey"
  FOREIGN KEY ("inspectionLotId") REFERENCES "mm_inspection_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
