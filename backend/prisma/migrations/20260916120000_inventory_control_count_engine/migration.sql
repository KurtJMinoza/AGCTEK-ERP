-- Phase 7: Inventory Control Count Engine

CREATE TABLE IF NOT EXISTS "mm_count_reason_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_reason_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_reason_codes_companyId_code_key" ON "mm_count_reason_codes"("companyId", "code");
CREATE INDEX IF NOT EXISTS "mm_count_reason_codes_isActive_idx" ON "mm_count_reason_codes"("isActive");

CREATE TABLE IF NOT EXISTS "mm_count_policies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "warehouseId" TEXT,
    "abcClass" TEXT,
    "velocityClass" TEXT,
    "riskClass" TEXT,
    "materialCategoryId" TEXT,
    "materialTypeId" TEXT,
    "frequencyDays" INTEGER NOT NULL DEFAULT 30,
    "varianceQtyTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "variancePctTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceValueTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minUnitValue" DECIMAL(65,30),
    "maxUnitValue" DECIMAL(65,30),
    "blindCountRequired" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyCountRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_policies_code_key" ON "mm_count_policies"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_policies_legacyCountRuleId_key" ON "mm_count_policies"("legacyCountRuleId");
CREATE INDEX IF NOT EXISTS "mm_count_policies_companyId_idx" ON "mm_count_policies"("companyId");
CREATE INDEX IF NOT EXISTS "mm_count_policies_warehouseId_idx" ON "mm_count_policies"("warehouseId");
CREATE INDEX IF NOT EXISTS "mm_count_policies_abcClass_idx" ON "mm_count_policies"("abcClass");
CREATE INDEX IF NOT EXISTS "mm_count_policies_isActive_idx" ON "mm_count_policies"("isActive");

CREATE TABLE IF NOT EXISTS "mm_count_plans" (
    "id" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "policyId" TEXT,
    "countType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "dueDate" TIMESTAMP(3),
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "legacyInventoryCountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_plans_planNumber_key" ON "mm_count_plans"("planNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_plans_legacyInventoryCountId_key" ON "mm_count_plans"("legacyInventoryCountId");
CREATE INDEX IF NOT EXISTS "mm_count_plans_companyId_status_idx" ON "mm_count_plans"("companyId", "status");
CREATE INDEX IF NOT EXISTS "mm_count_plans_warehouseId_status_idx" ON "mm_count_plans"("warehouseId", "status");
CREATE INDEX IF NOT EXISTS "mm_count_plans_policyId_idx" ON "mm_count_plans"("policyId");
CREATE INDEX IF NOT EXISTS "mm_count_plans_countType_idx" ON "mm_count_plans"("countType");

CREATE TABLE IF NOT EXISTS "mm_count_sessions" (
    "id" TEXT NOT NULL,
    "sessionNumber" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "countType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "blindMode" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_sessions_sessionNumber_key" ON "mm_count_sessions"("sessionNumber");
CREATE INDEX IF NOT EXISTS "mm_count_sessions_planId_idx" ON "mm_count_sessions"("planId");
CREATE INDEX IF NOT EXISTS "mm_count_sessions_warehouseId_status_idx" ON "mm_count_sessions"("warehouseId", "status");
CREATE INDEX IF NOT EXISTS "mm_count_sessions_companyId_status_idx" ON "mm_count_sessions"("companyId", "status");

CREATE TABLE IF NOT EXISTS "mm_count_tasks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "storageBinId" TEXT,
    "batchId" TEXT,
    "serialNumberId" TEXT,
    "uomId" TEXT NOT NULL,
    "systemQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "assignedCounter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastCountedAt" TIMESTAMP(3),
    "lastIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_tasks_sessionId_taskNumber_key" ON "mm_count_tasks"("sessionId", "taskNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_tasks_lastIdempotencyKey_key" ON "mm_count_tasks"("lastIdempotencyKey");
CREATE INDEX IF NOT EXISTS "mm_count_tasks_sessionId_status_idx" ON "mm_count_tasks"("sessionId", "status");
CREATE INDEX IF NOT EXISTS "mm_count_tasks_materialId_updatedAt_idx" ON "mm_count_tasks"("materialId", "updatedAt");
CREATE INDEX IF NOT EXISTS "mm_count_tasks_assignedCounter_idx" ON "mm_count_tasks"("assignedCounter");

CREATE TABLE IF NOT EXISTS "mm_count_entries" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "countQuantity" DECIMAL(65,30) NOT NULL,
    "uomId" TEXT NOT NULL,
    "counterId" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "isBlind" BOOLEAN NOT NULL DEFAULT false,
    "attachmentMeta" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_count_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_entries_taskId_sequence_key" ON "mm_count_entries"("taskId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_entries_idempotencyKey_key" ON "mm_count_entries"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "mm_count_entries_taskId_idx" ON "mm_count_entries"("taskId");

CREATE TABLE IF NOT EXISTS "mm_count_variances" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "entryId" TEXT,
    "systemQuantity" DECIMAL(65,30) NOT NULL,
    "countQuantity" DECIMAL(65,30) NOT NULL,
    "varianceQuantity" DECIMAL(65,30) NOT NULL,
    "variancePercentage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estimatedValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_variances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_count_variances_taskId_idx" ON "mm_count_variances"("taskId");
CREATE INDEX IF NOT EXISTS "mm_count_variances_status_idx" ON "mm_count_variances"("status");

CREATE TABLE IF NOT EXISTS "mm_count_recounts" (
    "id" TEXT NOT NULL,
    "varianceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requestedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_recounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_count_recounts_varianceId_idx" ON "mm_count_recounts"("varianceId");
CREATE INDEX IF NOT EXISTS "mm_count_recounts_taskId_status_idx" ON "mm_count_recounts"("taskId", "status");

CREATE TABLE IF NOT EXISTS "mm_count_adjustment_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "legacyAdjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mm_count_adjustment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_adjustment_requests_requestNumber_key" ON "mm_count_adjustment_requests"("requestNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_adjustment_requests_legacyAdjustmentId_key" ON "mm_count_adjustment_requests"("legacyAdjustmentId");
CREATE INDEX IF NOT EXISTS "mm_count_adjustment_requests_sessionId_idx" ON "mm_count_adjustment_requests"("sessionId");
CREATE INDEX IF NOT EXISTS "mm_count_adjustment_requests_companyId_status_idx" ON "mm_count_adjustment_requests"("companyId", "status");
CREATE INDEX IF NOT EXISTS "mm_count_adjustment_requests_warehouseId_status_idx" ON "mm_count_adjustment_requests"("warehouseId", "status");

CREATE TABLE IF NOT EXISTS "mm_count_adjustment_request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "varianceId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reasonCodeId" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "managerRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mm_count_adjustment_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mm_count_adjustment_request_lines_requestId_idx" ON "mm_count_adjustment_request_lines"("requestId");
CREATE INDEX IF NOT EXISTS "mm_count_adjustment_request_lines_taskId_idx" ON "mm_count_adjustment_request_lines"("taskId");

-- Seed global reason codes (companyId NULL)
INSERT INTO "mm_count_reason_codes" ("id", "companyId", "code", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('crc-damage', NULL, 'DAMAGE', 'Damage', 'Damaged stock', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-miscount', NULL, 'MISCOUNT', 'Miscount', 'Counting error', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-loss', NULL, 'LOSS', 'Loss', 'Lost stock', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-found', NULL, 'FOUND_STOCK', 'Found stock', 'Unrecorded found stock', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-data', NULL, 'DATA_ERROR', 'Data error', 'Master/data error', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-process', NULL, 'PROCESS_ERROR', 'Process error', 'Process failure', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-unknown', NULL, 'UNKNOWN', 'Unknown', 'Unknown root cause', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('crc-other', NULL, 'OTHER', 'Other', 'Other reason', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
