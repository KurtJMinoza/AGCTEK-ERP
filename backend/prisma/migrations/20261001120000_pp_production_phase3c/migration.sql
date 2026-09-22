CREATE TABLE IF NOT EXISTS "pp_bill_of_materials" (
    "id" TEXT NOT NULL,
    "bomNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plantId" TEXT,
    "parentMaterialId" TEXT NOT NULL,
    "baseQuantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "yieldFactor" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pp_bill_of_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pp_bill_of_materials_bomNumber_key" ON "pp_bill_of_materials"("bomNumber");
CREATE INDEX IF NOT EXISTS "pp_bill_of_materials_companyId_parentMaterialId_idx" ON "pp_bill_of_materials"("companyId", "parentMaterialId");
CREATE INDEX IF NOT EXISTS "pp_bill_of_materials_plantId_idx" ON "pp_bill_of_materials"("plantId");

CREATE TABLE IF NOT EXISTS "pp_bom_components" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "componentMaterialId" TEXT NOT NULL,
    "quantityPer" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT NOT NULL,
    "scrapFactor" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pp_bom_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pp_bom_components_bomId_lineNumber_key" ON "pp_bom_components"("bomId", "lineNumber");
CREATE INDEX IF NOT EXISTS "pp_bom_components_componentMaterialId_idx" ON "pp_bom_components"("componentMaterialId");

CREATE TABLE IF NOT EXISTS "pp_production_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "plantId" TEXT,
    "finishedMaterialId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pp_production_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pp_production_orders_orderNumber_key" ON "pp_production_orders"("orderNumber");
CREATE INDEX IF NOT EXISTS "pp_production_orders_companyId_status_idx" ON "pp_production_orders"("companyId", "status");
CREATE INDEX IF NOT EXISTS "pp_production_orders_correlationId_idx" ON "pp_production_orders"("correlationId");

CREATE TABLE IF NOT EXISTS "pp_production_order_materials" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "requiredQuantity" DECIMAL(65,30) NOT NULL,
    "reservedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reservationHeaderId" TEXT,
    "integrationStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pp_production_order_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pp_production_order_materials_productionOrderId_lineNumber_key" ON "pp_production_order_materials"("productionOrderId", "lineNumber");
CREATE INDEX IF NOT EXISTS "pp_production_order_materials_materialId_idx" ON "pp_production_order_materials"("materialId");

CREATE TABLE IF NOT EXISTS "pp_production_outputs" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "goodsReceiptId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pp_production_outputs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pp_production_outputs_productionOrderId_idx" ON "pp_production_outputs"("productionOrderId");
CREATE INDEX IF NOT EXISTS "pp_production_outputs_materialId_idx" ON "pp_production_outputs"("materialId");

CREATE TABLE IF NOT EXISTS "pp_event_outbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    CONSTRAINT "pp_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pp_event_outbox_eventId_key" ON "pp_event_outbox"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "pp_event_outbox_dedupeKey_key" ON "pp_event_outbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "pp_event_outbox_status_createdAt_idx" ON "pp_event_outbox"("status", "createdAt");

ALTER TABLE "pp_bill_of_materials" ADD CONSTRAINT "pp_bill_of_materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_bill_of_materials" ADD CONSTRAINT "pp_bill_of_materials_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pp_bill_of_materials" ADD CONSTRAINT "pp_bill_of_materials_parentMaterialId_fkey" FOREIGN KEY ("parentMaterialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_bom_components" ADD CONSTRAINT "pp_bom_components_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "pp_bill_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pp_bom_components" ADD CONSTRAINT "pp_bom_components_componentMaterialId_fkey" FOREIGN KEY ("componentMaterialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_production_orders" ADD CONSTRAINT "pp_production_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_production_orders" ADD CONSTRAINT "pp_production_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_production_orders" ADD CONSTRAINT "pp_production_orders_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pp_production_orders" ADD CONSTRAINT "pp_production_orders_finishedMaterialId_fkey" FOREIGN KEY ("finishedMaterialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_production_order_materials" ADD CONSTRAINT "pp_production_order_materials_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "pp_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pp_production_order_materials" ADD CONSTRAINT "pp_production_order_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pp_production_outputs" ADD CONSTRAINT "pp_production_outputs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "pp_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pp_production_outputs" ADD CONSTRAINT "pp_production_outputs_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mm_goods_receipts" ADD COLUMN IF NOT EXISTS "sourceDocumentType" TEXT;
ALTER TABLE "mm_goods_receipts" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;
ALTER TABLE "mm_goods_receipts" ADD COLUMN IF NOT EXISTS "receiptPurpose" TEXT NOT NULL DEFAULT 'PROCUREMENT';
CREATE INDEX IF NOT EXISTS "mm_goods_receipts_sourceDocumentType_sourceDocumentId_idx" ON "mm_goods_receipts"("sourceDocumentType", "sourceDocumentId");
