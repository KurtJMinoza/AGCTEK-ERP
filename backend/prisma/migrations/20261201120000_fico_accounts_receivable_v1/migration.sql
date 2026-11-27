-- FICO Accounts Receivable V1: customer invoice open items + clearing journal link.
-- Additive only.

CREATE TABLE "fico_ar_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceSalesInvoiceId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "clearingJournalEntryId" TEXT,
    "reversalJournalEntryId" TEXT,
    "originalDocumentId" TEXT,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "referenceNumber" TEXT,
    "documentDate" DATE NOT NULL,
    "postingDate" DATE NOT NULL,
    "baselineDate" DATE NOT NULL,
    "dueDate" DATE,
    "currencyCode" VARCHAR(3) NOT NULL,
    "netAmount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "receivableAmount" DECIMAL(18,4) NOT NULL,
    "reconciliationAccountId" TEXT,
    "reconciliationAccountCode" TEXT,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ar_documents_non_negative_check" CHECK (
        "netAmount" >= 0 AND "taxAmount" >= 0
        AND "grossAmount" >= 0 AND "receivableAmount" >= 0
    )
);

CREATE TABLE "fico_ar_open_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reconciliationAccountId" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'INVOICE',
    "direction" TEXT NOT NULL DEFAULT 'DEBIT',
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "openAmount" DECIMAL(18,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "baselineDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_open_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ar_open_items_amount_check" CHECK ("originalAmount" >= 0 AND "openAmount" >= 0)
);

CREATE UNIQUE INDEX "fico_ar_documents_sourceSalesInvoiceId_key" ON "fico_ar_documents"("sourceSalesInvoiceId");
CREATE UNIQUE INDEX "fico_ar_documents_journalEntryId_key" ON "fico_ar_documents"("journalEntryId");
CREATE UNIQUE INDEX "fico_ar_documents_clearingJournalEntryId_key" ON "fico_ar_documents"("clearingJournalEntryId");
CREATE UNIQUE INDEX "fico_ar_documents_reversalJournalEntryId_key" ON "fico_ar_documents"("reversalJournalEntryId");
CREATE INDEX "fico_ar_documents_companyId_customerId_status_idx" ON "fico_ar_documents"("companyId", "customerId", "status");
CREATE INDEX "fico_ar_documents_companyId_dueDate_idx" ON "fico_ar_documents"("companyId", "dueDate");
CREATE INDEX "fico_ar_documents_reconciliationAccountId_idx" ON "fico_ar_documents"("reconciliationAccountId");

CREATE UNIQUE INDEX "fico_ar_open_items_documentId_key" ON "fico_ar_open_items"("documentId");
CREATE INDEX "fico_ar_open_items_companyId_customerId_status_idx" ON "fico_ar_open_items"("companyId", "customerId", "status");
CREATE INDEX "fico_ar_open_items_companyId_dueDate_status_idx" ON "fico_ar_open_items"("companyId", "dueDate", "status");
CREATE INDEX "fico_ar_open_items_reconciliationAccountId_status_idx" ON "fico_ar_open_items"("reconciliationAccountId", "status");

ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_sourceSalesInvoiceId_fkey"
    FOREIGN KEY ("sourceSalesInvoiceId") REFERENCES "sd_sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_clearingJournalEntryId_fkey"
    FOREIGN KEY ("clearingJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_reversalJournalEntryId_fkey"
    FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_originalDocumentId_fkey"
    FOREIGN KEY ("originalDocumentId") REFERENCES "fico_ar_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents"
    ADD CONSTRAINT "fico_ar_documents_reconciliationAccountId_fkey"
    FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_open_items"
    ADD CONSTRAINT "fico_ar_open_items_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items"
    ADD CONSTRAINT "fico_ar_open_items_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items"
    ADD CONSTRAINT "fico_ar_open_items_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "fico_ar_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items"
    ADD CONSTRAINT "fico_ar_open_items_reconciliationAccountId_fkey"
    FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
