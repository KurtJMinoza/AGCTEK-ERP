-- SD ↔ MM product assignment, fulfillment, branch warehouse mapping

ALTER TABLE "sd_products" ADD COLUMN IF NOT EXISTS "productType" TEXT NOT NULL DEFAULT 'STOCK_ITEM';
ALTER TABLE "sd_products" ADD COLUMN IF NOT EXISTS "salesUomId" TEXT;

ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "salesUomId" TEXT;
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "baseQuantity" DECIMAL(65,30);
ALTER TABLE "sd_sales_order_lines" ADD COLUMN IF NOT EXISTS "baseUomId" TEXT;

CREATE TABLE IF NOT EXISTS "sd_product_material_assignments" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT,
    "salesUomId" TEXT,
    "materialUomId" TEXT,
    "fulfillmentType" TEXT NOT NULL DEFAULT 'WAREHOUSE',
    "inventoryRelevant" BOOLEAN NOT NULL DEFAULT true,
    "atpRelevant" BOOLEAN NOT NULL DEFAULT true,
    "reservationRelevant" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_product_material_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sd_branch_fulfillment" (
    "id" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "divisionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_branch_fulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sd_branch_fulfillment_branchCode_key" ON "sd_branch_fulfillment"("branchCode");

CREATE TABLE IF NOT EXISTS "sd_fulfillments" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "fulfillmentMethod" TEXT NOT NULL DEFAULT 'WAREHOUSE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requestedDate" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_fulfillments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sd_fulfillment_lines" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "productId" TEXT,
    "materialId" TEXT,
    "salesQty" DECIMAL(65,30) NOT NULL,
    "salesUomId" TEXT,
    "baseQty" DECIMAL(65,30) NOT NULL,
    "baseUomId" TEXT NOT NULL,
    "reservedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allocatedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pickedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "packedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_fulfillment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sd_product_material_assignments_productId_companyId_status_idx" ON "sd_product_material_assignments"("productId", "companyId", "status");
CREATE INDEX IF NOT EXISTS "sd_product_material_assignments_materialId_idx" ON "sd_product_material_assignments"("materialId");
CREATE INDEX IF NOT EXISTS "sd_branch_fulfillment_companyId_idx" ON "sd_branch_fulfillment"("companyId");
CREATE INDEX IF NOT EXISTS "sd_fulfillments_salesOrderId_idx" ON "sd_fulfillments"("salesOrderId");
CREATE INDEX IF NOT EXISTS "sd_fulfillments_warehouseId_status_idx" ON "sd_fulfillments"("warehouseId", "status");
CREATE INDEX IF NOT EXISTS "sd_fulfillment_lines_fulfillmentId_idx" ON "sd_fulfillment_lines"("fulfillmentId");
CREATE INDEX IF NOT EXISTS "sd_fulfillment_lines_salesOrderLineId_idx" ON "sd_fulfillment_lines"("salesOrderLineId");
CREATE INDEX IF NOT EXISTS "sd_sales_order_lines_productId_idx" ON "sd_sales_order_lines"("productId");

ALTER TABLE "sd_products" ADD CONSTRAINT "sd_products_salesUomId_fkey" FOREIGN KEY ("salesUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sd_product_material_assignments" ADD CONSTRAINT "sd_product_material_assignments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sd_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_product_material_assignments" ADD CONSTRAINT "sd_product_material_assignments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_product_material_assignments" ADD CONSTRAINT "sd_product_material_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_product_material_assignments" ADD CONSTRAINT "sd_product_material_assignments_salesUomId_fkey" FOREIGN KEY ("salesUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sd_product_material_assignments" ADD CONSTRAINT "sd_product_material_assignments_materialUomId_fkey" FOREIGN KEY ("materialUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sd_branch_fulfillment" ADD CONSTRAINT "sd_branch_fulfillment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_branch_fulfillment" ADD CONSTRAINT "sd_branch_fulfillment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_fulfillments" ADD CONSTRAINT "sd_fulfillments_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_fulfillments" ADD CONSTRAINT "sd_fulfillments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_fulfillments" ADD CONSTRAINT "sd_fulfillments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sd_fulfillment_lines" ADD CONSTRAINT "sd_fulfillment_lines_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "sd_fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_fulfillment_lines" ADD CONSTRAINT "sd_fulfillment_lines_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sd_sales_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_fulfillment_lines" ADD CONSTRAINT "sd_fulfillment_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sd_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sd_fulfillment_lines" ADD CONSTRAINT "sd_fulfillment_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sd_sales_order_lines" ADD CONSTRAINT "sd_sales_order_lines_salesUomId_fkey" FOREIGN KEY ("salesUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sd_sales_order_lines" ADD CONSTRAINT "sd_sales_order_lines_baseUomId_fkey" FOREIGN KEY ("baseUomId") REFERENCES "mm_uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
