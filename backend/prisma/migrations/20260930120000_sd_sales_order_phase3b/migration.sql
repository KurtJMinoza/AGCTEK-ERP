CREATE TABLE IF NOT EXISTS "sd_sales_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sd_sales_orders_orderNumber_key" ON "sd_sales_orders"("orderNumber");
CREATE INDEX IF NOT EXISTS "sd_sales_orders_companyId_status_idx" ON "sd_sales_orders"("companyId", "status");
CREATE INDEX IF NOT EXISTS "sd_sales_orders_correlationId_idx" ON "sd_sales_orders"("correlationId");

CREATE TABLE IF NOT EXISTS "sd_sales_order_lines" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reservedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reservationHeaderId" TEXT,
    "integrationStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_sales_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sd_sales_order_lines_salesOrderId_lineNumber_key" ON "sd_sales_order_lines"("salesOrderId", "lineNumber");
CREATE INDEX IF NOT EXISTS "sd_sales_order_lines_materialId_idx" ON "sd_sales_order_lines"("materialId");

CREATE TABLE IF NOT EXISTS "sd_shipments" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "goodsIssueId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_shipments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sd_shipments_shipmentNumber_key" ON "sd_shipments"("shipmentNumber");
CREATE INDEX IF NOT EXISTS "sd_shipments_salesOrderId_idx" ON "sd_shipments"("salesOrderId");

CREATE TABLE IF NOT EXISTS "sd_event_outbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "sd_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sd_event_outbox_eventId_key" ON "sd_event_outbox"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "sd_event_outbox_dedupeKey_key" ON "sd_event_outbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "sd_event_outbox_status_createdAt_idx" ON "sd_event_outbox"("status", "createdAt");

ALTER TABLE "sd_sales_orders" ADD CONSTRAINT "sd_sales_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_sales_orders" ADD CONSTRAINT "sd_sales_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_sales_order_lines" ADD CONSTRAINT "sd_sales_order_lines_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sd_sales_order_lines" ADD CONSTRAINT "sd_sales_order_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_shipments" ADD CONSTRAINT "sd_shipments_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sd_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_shipments" ADD CONSTRAINT "sd_shipments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sd_shipments" ADD CONSTRAINT "sd_shipments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mm_inventory_reservation_headers" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "mm_inventory_reservation_lines" ADD COLUMN IF NOT EXISTS "demandReferenceLineId" TEXT;
ALTER TABLE "mm_goods_issues" ADD COLUMN IF NOT EXISTS "reservationHeaderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "mm_inventory_reservation_headers_sourceModule_sourceDocumentType_sourceDocumentId_idempotencyKey_key"
ON "mm_inventory_reservation_headers"("sourceModule", "sourceDocumentType", "sourceDocumentId", "idempotencyKey");

ALTER TABLE "mm_goods_issues" ADD CONSTRAINT "mm_goods_issues_reservationHeaderId_fkey" FOREIGN KEY ("reservationHeaderId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
