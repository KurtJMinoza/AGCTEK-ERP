-- Warehouse Task Engine (Phase 4)

CREATE TABLE "wm_warehouse_tasks" (
    "id" TEXT NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plantId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceBinId" TEXT,
    "destinationBinId" TEXT,
    "materialId" TEXT,
    "batchId" TEXT,
    "serialId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "completedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "uomId" TEXT,
    "assignedUserId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "stockStatus" TEXT DEFAULT 'UNRESTRICTED',
    "exceptionReason" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wm_warehouse_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wm_warehouse_tasks_taskNumber_key" ON "wm_warehouse_tasks"("taskNumber");
CREATE INDEX "wm_warehouse_tasks_warehouseId_status_taskType_idx" ON "wm_warehouse_tasks"("warehouseId", "status", "taskType");
CREATE INDEX "wm_warehouse_tasks_assignedUserId_status_idx" ON "wm_warehouse_tasks"("assignedUserId", "status");
CREATE INDEX "wm_warehouse_tasks_referenceType_referenceId_idx" ON "wm_warehouse_tasks"("referenceType", "referenceId");

ALTER TABLE "wm_warehouse_tasks" ADD CONSTRAINT "wm_warehouse_tasks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wm_warehouse_tasks" ADD CONSTRAINT "wm_warehouse_tasks_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "mm_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "wm_warehouse_task_exceptions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "exceptionCode" TEXT NOT NULL,
    "details" TEXT,
    "reportedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wm_warehouse_task_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wm_warehouse_task_exceptions_taskId_idx" ON "wm_warehouse_task_exceptions"("taskId");
ALTER TABLE "wm_warehouse_task_exceptions" ADD CONSTRAINT "wm_warehouse_task_exceptions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "wm_warehouse_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wm_packing_sessions" (
    "id" TEXT NOT NULL,
    "sessionNumber" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "warehouseTaskId" TEXT,
    "pickingTaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wm_packing_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wm_packing_sessions_sessionNumber_key" ON "wm_packing_sessions"("sessionNumber");
CREATE INDEX "wm_packing_sessions_warehouseId_status_idx" ON "wm_packing_sessions"("warehouseId", "status");
ALTER TABLE "wm_packing_sessions" ADD CONSTRAINT "wm_packing_sessions_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wm_packing_sessions" ADD CONSTRAINT "wm_packing_sessions_warehouseTaskId_fkey" FOREIGN KEY ("warehouseTaskId") REFERENCES "wm_warehouse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wm_packing_sessions" ADD CONSTRAINT "wm_packing_sessions_pickingTaskId_fkey" FOREIGN KEY ("pickingTaskId") REFERENCES "wm_picking_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wm_putaway_tasks" ADD COLUMN "warehouseTaskId" TEXT;
CREATE UNIQUE INDEX "wm_putaway_tasks_warehouseTaskId_key" ON "wm_putaway_tasks"("warehouseTaskId");
ALTER TABLE "wm_putaway_tasks" ADD CONSTRAINT "wm_putaway_tasks_warehouseTaskId_fkey" FOREIGN KEY ("warehouseTaskId") REFERENCES "wm_warehouse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wm_picking_tasks" ADD COLUMN "warehouseTaskId" TEXT;
CREATE UNIQUE INDEX "wm_picking_tasks_warehouseTaskId_key" ON "wm_picking_tasks"("warehouseTaskId");
ALTER TABLE "wm_picking_tasks" ADD CONSTRAINT "wm_picking_tasks_warehouseTaskId_fkey" FOREIGN KEY ("warehouseTaskId") REFERENCES "wm_warehouse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wm_packages" ADD COLUMN "packingSessionId" TEXT;
ALTER TABLE "wm_packages" ADD CONSTRAINT "wm_packages_packingSessionId_fkey" FOREIGN KEY ("packingSessionId") REFERENCES "wm_packing_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
