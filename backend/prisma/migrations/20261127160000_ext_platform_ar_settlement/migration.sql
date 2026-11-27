-- External platform: AR subledger link, settlement lifecycle, sales-source counterparty

ALTER TABLE "sd_sales_sources"
    ADD COLUMN IF NOT EXISTS "counterpartyCustomerId" TEXT;

ALTER TABLE "sd_sales_sources"
    DROP CONSTRAINT IF EXISTS "sd_sales_sources_counterpartyCustomerId_fkey";
ALTER TABLE "sd_sales_sources"
    ADD CONSTRAINT "sd_sales_sources_counterpartyCustomerId_fkey"
    FOREIGN KEY ("counterpartyCustomerId") REFERENCES "sd_customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sd_sales_sources_counterpartyCustomerId_idx"
    ON "sd_sales_sources"("counterpartyCustomerId");

ALTER TABLE "sd_ext_platform_transactions"
    ADD COLUMN IF NOT EXISTS "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "actualPlatformFees" DECIMAL(18,4),
    ADD COLUMN IF NOT EXISTS "actualPayout" DECIMAL(18,4),
    ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "settlementJournalEntryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_ext_platform_transactions_settlementJournalEntryId_key"
    ON "sd_ext_platform_transactions"("settlementJournalEntryId");

ALTER TABLE "sd_ext_platform_transactions"
    DROP CONSTRAINT IF EXISTS "sd_ext_platform_transactions_settlementJournalEntryId_fkey";
ALTER TABLE "sd_ext_platform_transactions"
    ADD CONSTRAINT "sd_ext_platform_transactions_settlementJournalEntryId_fkey"
    FOREIGN KEY ("settlementJournalEntryId") REFERENCES "fico_journal_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sd_ext_platform_transactions_companyId_settlementStatus_idx"
    ON "sd_ext_platform_transactions"("companyId", "settlementStatus");

ALTER TABLE "fico_ar_documents"
    ADD COLUMN IF NOT EXISTS "sourceExtPlatformTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "fico_ar_documents_sourceExtPlatformTransactionId_key"
    ON "fico_ar_documents"("sourceExtPlatformTransactionId");

ALTER TABLE "fico_ar_documents"
    DROP CONSTRAINT IF EXISTS "fico_ar_documents_sourceExtPlatformTransactionId_fkey";
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_sourceExtPlatformTransactionId_fkey"
    FOREIGN KEY ("sourceExtPlatformTransactionId") REFERENCES "sd_ext_platform_transactions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;