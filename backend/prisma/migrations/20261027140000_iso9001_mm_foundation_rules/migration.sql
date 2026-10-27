CREATE TABLE IF NOT EXISTS "wm_putaway_rules" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyCode" TEXT NOT NULL DEFAULT 'CAPACITY_BASED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "storageTypeId" TEXT,
    "enforceBinCapacity" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wm_putaway_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wm_picking_rules" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyCode" TEXT NOT NULL DEFAULT 'FIFO',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wm_picking_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wm_putaway_rules_warehouseId_code_key"
ON "wm_putaway_rules"("warehouseId", "code");

CREATE INDEX IF NOT EXISTS "wm_putaway_rules_warehouseId_isActive_priority_idx"
ON "wm_putaway_rules"("warehouseId", "isActive", "priority");

CREATE UNIQUE INDEX IF NOT EXISTS "wm_picking_rules_warehouseId_code_key"
ON "wm_picking_rules"("warehouseId", "code");

CREATE INDEX IF NOT EXISTS "wm_picking_rules_warehouseId_isActive_priority_idx"
ON "wm_picking_rules"("warehouseId", "isActive", "priority");

ALTER TABLE "wm_putaway_rules"
ADD CONSTRAINT "wm_putaway_rules_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wm_putaway_rules"
ADD CONSTRAINT "wm_putaway_rules_storageTypeId_fkey"
FOREIGN KEY ("storageTypeId") REFERENCES "wm_storage_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wm_picking_rules"
ADD CONSTRAINT "wm_picking_rules_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
