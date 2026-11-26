CREATE TABLE "fico_reconciliation_cases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "journalEntryId" TEXT,
    "mmAccountingEventId" TEXT,
    "recommendedAction" TEXT,
    "investigationNotes" TEXT,
    "resolutionCode" TEXT,
    "resolutionNotes" TEXT,
    "assignedTo" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_reconciliation_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_reconciliation_cases_companyId_fingerprint_key" ON "fico_reconciliation_cases"("companyId", "fingerprint");
CREATE INDEX "fico_reconciliation_cases_companyId_status_severity_idx" ON "fico_reconciliation_cases"("companyId", "status", "severity");

ALTER TABLE "fico_reconciliation_cases" ADD CONSTRAINT "fico_reconciliation_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fico_opening_balance_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "migrationDate" DATE NOT NULL,
    "postingDate" DATE NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "sourceSystem" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "legacyTbTotalDebit" DECIMAL(18,4),
    "legacyTbTotalCredit" DECIMAL(18,4),
    "createdBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_opening_balance_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_opening_balance_batches_companyId_batchReference_key" ON "fico_opening_balance_batches"("companyId", "batchReference");
CREATE INDEX "fico_opening_balance_batches_companyId_status_idx" ON "fico_opening_balance_batches"("companyId", "status");

ALTER TABLE "fico_opening_balance_batches" ADD CONSTRAINT "fico_opening_balance_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fico_opening_balance_lines" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "importCode" TEXT,
    "importName" TEXT,

    CONSTRAINT "fico_opening_balance_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_opening_balance_lines_batchId_lineNumber_key" ON "fico_opening_balance_lines"("batchId", "lineNumber");
CREATE INDEX "fico_opening_balance_lines_glAccountId_idx" ON "fico_opening_balance_lines"("glAccountId");

ALTER TABLE "fico_opening_balance_lines" ADD CONSTRAINT "fico_opening_balance_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fico_opening_balance_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fico_opening_balance_lines" ADD CONSTRAINT "fico_opening_balance_lines_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;