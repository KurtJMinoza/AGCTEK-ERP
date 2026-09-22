-- Phase 3D: MM ↔ FICO accounting event hardening

ALTER TABLE "mm_accounting_events" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "sourceTransactionId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "plantId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "postingDate" TIMESTAMP(3);
ALTER TABLE "mm_accounting_events" ADD COLUMN "currencyCode" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "totalValue" DECIMAL(18,4);
ALTER TABLE "mm_accounting_events" ADD COLUMN "accountingEffects" JSONB;
ALTER TABLE "mm_accounting_events" ADD COLUMN "journalEntryId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "mm_accounting_events_idempotencyKey_key" ON "mm_accounting_events"("idempotencyKey");
CREATE INDEX "mm_accounting_events_companyId_postingDate_idx" ON "mm_accounting_events"("companyId", "postingDate");
CREATE INDEX "mm_accounting_events_sourceEventId_idx" ON "mm_accounting_events"("sourceEventId");

CREATE TABLE "fico_financial_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_financial_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_journal_entries" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "sourceTransactionId" TEXT,
    "mmAccountingEventId" TEXT,
    "companyId" TEXT NOT NULL,
    "postingDate" DATE NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_financial_periods_companyId_fiscalYear_periodNumber_key" ON "fico_financial_periods"("companyId", "fiscalYear", "periodNumber");
CREATE INDEX "fico_financial_periods_companyId_status_idx" ON "fico_financial_periods"("companyId", "status");

CREATE UNIQUE INDEX "fico_journal_entries_idempotencyKey_key" ON "fico_journal_entries"("idempotencyKey");
CREATE UNIQUE INDEX "fico_journal_entries_mmAccountingEventId_key" ON "fico_journal_entries"("mmAccountingEventId");
CREATE INDEX "fico_journal_entries_companyId_postingDate_idx" ON "fico_journal_entries"("companyId", "postingDate");
CREATE INDEX "fico_journal_entries_sourceEventId_idx" ON "fico_journal_entries"("sourceEventId");

ALTER TABLE "fico_financial_periods" ADD CONSTRAINT "fico_financial_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_mmAccountingEventId_fkey" FOREIGN KEY ("mmAccountingEventId") REFERENCES "mm_accounting_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
