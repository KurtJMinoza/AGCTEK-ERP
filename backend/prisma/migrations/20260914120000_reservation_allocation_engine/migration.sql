-- Phase 5: Inventory Reservation + Allocation Engine

ALTER TABLE "mm_inventory_reservations"
ADD COLUMN IF NOT EXISTS "reservationHeaderId" TEXT,
ADD COLUMN IF NOT EXISTS "reservationLineId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "mm_inventory_reservations_reservationLineId_key"
ON "mm_inventory_reservations"("reservationLineId");

CREATE TABLE IF NOT EXISTS "mm_inventory_reservation_headers" (
    "id" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "demandReferenceType" TEXT,
    "demandReferenceId" TEXT,
    "demandReferenceLineId" TEXT,
    "sourceModule" TEXT NOT NULL,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "allowPartialReservation" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inventory_reservation_headers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_inventory_reservation_headers_reservationNumber_key"
ON "mm_inventory_reservation_headers"("reservationNumber");

CREATE INDEX IF NOT EXISTS "mm_inventory_reservation_headers_companyId_warehouseId_status_idx"
ON "mm_inventory_reservation_headers"("companyId", "warehouseId", "status");

CREATE INDEX IF NOT EXISTS "mm_inventory_reservation_headers_demandReferenceType_demandReferenceId_idx"
ON "mm_inventory_reservation_headers"("demandReferenceType", "demandReferenceId");

CREATE INDEX IF NOT EXISTS "mm_inventory_reservation_headers_sourceDocumentId_idx"
ON "mm_inventory_reservation_headers"("sourceDocumentId");

CREATE TABLE IF NOT EXISTS "mm_inventory_reservation_lines" (
    "id" TEXT NOT NULL,
    "headerId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "stockStatus" TEXT NOT NULL DEFAULT 'UNRESTRICTED',
    "uomId" TEXT,
    "requestedQuantity" DECIMAL(65,30) NOT NULL,
    "reservedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allocatedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pickedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inventory_reservation_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_inventory_reservation_lines_headerId_lineNumber_key"
ON "mm_inventory_reservation_lines"("headerId", "lineNumber");

CREATE INDEX IF NOT EXISTS "mm_inventory_reservation_lines_materialId_idx"
ON "mm_inventory_reservation_lines"("materialId");

CREATE INDEX IF NOT EXISTS "mm_inventory_reservation_lines_headerId_status_idx"
ON "mm_inventory_reservation_lines"("headerId", "status");

CREATE TABLE IF NOT EXISTS "mm_inventory_allocations" (
    "id" TEXT NOT NULL,
    "allocationNumber" TEXT NOT NULL,
    "headerId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'FIFO',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inventory_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_inventory_allocations_allocationNumber_key"
ON "mm_inventory_allocations"("allocationNumber");

CREATE INDEX IF NOT EXISTS "mm_inventory_allocations_headerId_status_idx"
ON "mm_inventory_allocations"("headerId", "status");

CREATE TABLE IF NOT EXISTS "mm_inventory_allocation_lines" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "reservationLineId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "storageBinId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "pickedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_inventory_allocation_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_inventory_allocation_lines_allocationId_idx"
ON "mm_inventory_allocation_lines"("allocationId");

CREATE INDEX IF NOT EXISTS "mm_inventory_allocation_lines_reservationLineId_idx"
ON "mm_inventory_allocation_lines"("reservationLineId");

CREATE INDEX IF NOT EXISTS "mm_inventory_allocation_lines_storageBinId_materialId_idx"
ON "mm_inventory_allocation_lines"("storageBinId", "materialId");

ALTER TABLE "wm_picking_tasks"
ADD COLUMN IF NOT EXISTS "reservationHeaderId" TEXT,
ADD COLUMN IF NOT EXISTS "reservationLineId" TEXT,
ADD COLUMN IF NOT EXISTS "allocationLineId" TEXT;

-- Foreign keys (idempotent via DO blocks where needed)
DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservations" ADD CONSTRAINT "mm_inventory_reservations_reservationHeaderId_fkey"
    FOREIGN KEY ("reservationHeaderId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservations" ADD CONSTRAINT "mm_inventory_reservations_reservationLineId_fkey"
    FOREIGN KEY ("reservationLineId") REFERENCES "mm_inventory_reservation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservation_headers" ADD CONSTRAINT "mm_inventory_reservation_headers_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservation_headers" ADD CONSTRAINT "mm_inventory_reservation_headers_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservation_lines" ADD CONSTRAINT "mm_inventory_reservation_lines_headerId_fkey"
    FOREIGN KEY ("headerId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_reservation_lines" ADD CONSTRAINT "mm_inventory_reservation_lines_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_allocations" ADD CONSTRAINT "mm_inventory_allocations_headerId_fkey"
    FOREIGN KEY ("headerId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_allocation_lines" ADD CONSTRAINT "mm_inventory_allocation_lines_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES "mm_inventory_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "mm_inventory_allocation_lines" ADD CONSTRAINT "mm_inventory_allocation_lines_reservationLineId_fkey"
    FOREIGN KEY ("reservationLineId") REFERENCES "mm_inventory_reservation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_reservationHeaderId_fkey"
    FOREIGN KEY ("reservationHeaderId") REFERENCES "mm_inventory_reservation_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_reservationLineId_fkey"
    FOREIGN KEY ("reservationLineId") REFERENCES "mm_inventory_reservation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_allocationLineId_fkey"
    FOREIGN KEY ("allocationLineId") REFERENCES "mm_inventory_allocation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
