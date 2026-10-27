-- ISO 9001 inventory control: company config, session snapshot, dual approval

CREATE TABLE IF NOT EXISTS "mm_count_company_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "blindCountingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "separationOfDutiesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recountOnEveryDiscrepancy" BOOLEAN NOT NULL DEFAULT false,
    "recountOnToleranceExceeded" BOOLEAN NOT NULL DEFAULT true,
    "absoluteQtyTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financialValueTolerance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxRecounts" INTEGER NOT NULL DEFAULT 2,
    "differentRecountWorkerRequired" BOOLEAN NOT NULL DEFAULT true,
    "movementControlPolicy" TEXT NOT NULL DEFAULT 'SOFT',
    "adjustmentApprovalValueThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financeApprovalValueThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "requireVarianceEvidence" BOOLEAN NOT NULL DEFAULT false,
    "requireRootCauseAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "allowZeroCountConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "mobileBarcodeScanningAllowed" BOOLEAN NOT NULL DEFAULT true,
    "requireBatchLevelCounting" BOOLEAN NOT NULL DEFAULT false,
    "requireSerialLevelCounting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mm_count_company_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mm_count_company_configs_companyId_key"
ON "mm_count_company_configs"("companyId");

ALTER TABLE "mm_count_company_configs"
ADD CONSTRAINT "mm_count_company_configs_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mm_count_sessions"
ADD COLUMN IF NOT EXISTS "inventorySnapshotAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "movementControlMode" TEXT;

ALTER TABLE "mm_count_adjustment_requests"
ADD COLUMN IF NOT EXISTS "warehouseApprovedBy" TEXT,
ADD COLUMN IF NOT EXISTS "warehouseApprovedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "financeApprovedBy" TEXT,
ADD COLUMN IF NOT EXISTS "financeApprovedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "totalAdjustmentValue" DECIMAL(65,30);
