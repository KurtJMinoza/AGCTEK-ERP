-- Year-end / period closing run audit trail (idempotent closing execution).
CREATE TABLE "fico_period_closing_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriodId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "validationSnapshot" JSONB,
    "closingJournalEntryId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_period_closing_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_period_closing_runs_idempotencyKey_key" ON "fico_period_closing_runs"("idempotencyKey");
CREATE UNIQUE INDEX "fico_period_closing_runs_companyId_runType_fiscalYear_key" ON "fico_period_closing_runs"("companyId", "runType", "fiscalYear");
CREATE INDEX "fico_period_closing_runs_companyId_fiscalYear_status_idx" ON "fico_period_closing_runs"("companyId", "fiscalYear", "status");

ALTER TABLE "fico_period_closing_runs" ADD CONSTRAINT "fico_period_closing_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;