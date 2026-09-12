-- Phase 6: Stock Transfer Order engine

ALTER TABLE "wm_warehouse_transfers" ADD COLUMN IF NOT EXISTS "stockTransferOrderId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "wm_warehouse_transfers_stockTransferOrderId_key" ON "wm_warehouse_transfers"("stockTransferOrderId");

ALTER TABLE "mm_warehouse_transfer_orders" ADD COLUMN IF NOT EXISTS "legacyStoId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "mm_warehouse_transfer_orders_legacyStoId_key" ON "mm_warehouse_transfer_orders"("legacyStoId");

CREATE TABLE IF NOT EXISTS "mm_stock_transfer_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transferType" TEXT NOT NULL DEFAULT 'WAREHOUSE_TO_WAREHOUSE',
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "reservationHeaderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "legacyWmTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_stock_transfer_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_stock_transfer_orders_orderNumber_key" ON "mm_stock_transfer_orders"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_stock_transfer_orders_legacyWmTransferId_key" ON "mm_stock_transfer_orders"("legacyWmTransferId");
CREATE INDEX IF NOT EXISTS "mm_stock_transfer_orders_companyId_status_idx" ON "mm_stock_transfer_orders"("companyId", "status");
CREATE INDEX IF NOT EXISTS "mm_stock_transfer_orders_sourceWarehouseId_status_idx" ON "mm_stock_transfer_orders"("sourceWarehouseId", "status");
CREATE INDEX IF NOT EXISTS "mm_stock_transfer_orders_destinationWarehouseId_status_idx" ON "mm_stock_transfer_orders"("destinationWarehouseId", "status");

CREATE TABLE IF NOT EXISTS "mm_stock_transfer_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT NOT NULL,
    "sourceBinId" TEXT,
    "destinationBinId" TEXT,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "allocatedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dispatchedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "receivedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_stock_transfer_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_stock_transfer_order_lines_orderId_lineNumber_key" ON "mm_stock_transfer_order_lines"("orderId", "lineNumber");
CREATE INDEX IF NOT EXISTS "mm_stock_transfer_order_lines_orderId_idx" ON "mm_stock_transfer_order_lines"("orderId");

CREATE TABLE IF NOT EXISTS "mm_transfer_shipments" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_transfer_shipments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_transfer_shipments_shipmentNumber_key" ON "mm_transfer_shipments"("shipmentNumber");
CREATE INDEX IF NOT EXISTS "mm_transfer_shipments_orderId_status_idx" ON "mm_transfer_shipments"("orderId", "status");

CREATE TABLE IF NOT EXISTS "mm_transfer_shipment_lines" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_transfer_shipment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_transfer_shipment_lines_shipmentId_idx" ON "mm_transfer_shipment_lines"("shipmentId");
CREATE INDEX IF NOT EXISTS "mm_transfer_shipment_lines_orderLineId_idx" ON "mm_transfer_shipment_lines"("orderLineId");

CREATE TABLE IF NOT EXISTS "mm_transfer_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_transfer_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_transfer_receipts_receiptNumber_key" ON "mm_transfer_receipts"("receiptNumber");
CREATE INDEX IF NOT EXISTS "mm_transfer_receipts_orderId_status_idx" ON "mm_transfer_receipts"("orderId", "status");

CREATE TABLE IF NOT EXISTS "mm_transfer_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "destinationBinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_transfer_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_transfer_receipt_lines_receiptId_idx" ON "mm_transfer_receipt_lines"("receiptId");
CREATE INDEX IF NOT EXISTS "mm_transfer_receipt_lines_orderLineId_idx" ON "mm_transfer_receipt_lines"("orderLineId");

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_orders" ADD CONSTRAINT "mm_stock_transfer_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_orders" ADD CONSTRAINT "mm_stock_transfer_orders_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_orders" ADD CONSTRAINT "mm_stock_transfer_orders_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_orders" ADD CONSTRAINT "mm_stock_transfer_orders_reservationHeaderId_fkey" FOREIGN KEY ("reservationHeaderId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_order_lines" ADD CONSTRAINT "mm_stock_transfer_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mm_stock_transfer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_order_lines" ADD CONSTRAINT "mm_stock_transfer_order_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_stock_transfer_order_lines" ADD CONSTRAINT "mm_stock_transfer_order_lines_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "mm_uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_shipments" ADD CONSTRAINT "mm_transfer_shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mm_stock_transfer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_shipment_lines" ADD CONSTRAINT "mm_transfer_shipment_lines_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "mm_transfer_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_shipment_lines" ADD CONSTRAINT "mm_transfer_shipment_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "mm_stock_transfer_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_receipts" ADD CONSTRAINT "mm_transfer_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mm_stock_transfer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_receipts" ADD CONSTRAINT "mm_transfer_receipts_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "mm_transfer_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_receipt_lines" ADD CONSTRAINT "mm_transfer_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "mm_transfer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_transfer_receipt_lines" ADD CONSTRAINT "mm_transfer_receipt_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "mm_stock_transfer_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "wm_warehouse_transfers" ADD CONSTRAINT "wm_warehouse_transfers_stockTransferOrderId_fkey" FOREIGN KEY ("stockTransferOrderId") REFERENCES "mm_stock_transfer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mm_warehouse_transfer_orders" ADD CONSTRAINT "mm_warehouse_transfer_orders_legacyStoId_fkey" FOREIGN KEY ("legacyStoId") REFERENCES "mm_stock_transfer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
