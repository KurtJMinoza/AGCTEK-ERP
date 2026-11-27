-- Phase 07: Accounts Receivable subledger (mirrors AP patterns; SD-owned customer master).

ALTER TABLE "fico_journal_entries"
    ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE TABLE "fico_customer_company_accounts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerAccountGroup" TEXT NOT NULL DEFAULT 'STANDARD',
    "reconciliationAccountId" TEXT,
    "paymentTermsId" TEXT,
    "defaultPaymentMethodCode" TEXT,
    "transactionCurrencyCode" VARCHAR(3),
    "defaultSalesTaxCodeId" TEXT,
    "creditLimit" DECIMAL(18,4),
    "postingBlocked" BOOLEAN NOT NULL DEFAULT false,
    "collectionBlocked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_customer_company_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_credit_profiles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditExposure" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "availableCredit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditBlocked" BOOLEAN NOT NULL DEFAULT false,
    "overrideLimit" DECIMAL(18,4),
    "overrideAuthorizedBy" TEXT,
    "overrideAuthorizedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "lastRecalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_credit_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerCompanyAccountId" TEXT,
    "sourceSalesInvoiceId" TEXT,
    "sourceSalesOrderId" TEXT,
    "journalEntryId" TEXT NOT NULL,
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
    "taxCodeId" TEXT,
    "collectionBlocked" BOOLEAN NOT NULL DEFAULT false,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_document_lines" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INT NOT NULL DEFAULT 1,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "sourceSalesInvoiceLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_ar_document_lines_pkey" PRIMARY KEY ("id")
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
    "collectionBlocked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_open_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerCompanyAccountId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "paymentNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "allocatedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unallocatedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paymentMethodCode" TEXT,
    "bankAccountId" TEXT,
    "paymentReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "openItemId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLEARED',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_clearings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "clearingNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "clearingDate" DATE NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reference" TEXT,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_clearings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ar_clearing_lines" (
    "id" TEXT NOT NULL,
    "clearingId" TEXT NOT NULL,
    "debitOpenItemId" TEXT NOT NULL,
    "creditOpenItemId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLEARED',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ar_clearing_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_customer_company_accounts_customerId_companyId_key" ON "fico_customer_company_accounts"("customerId", "companyId");
CREATE UNIQUE INDEX "fico_ar_credit_profiles_customerId_companyId_key" ON "fico_ar_credit_profiles"("customerId", "companyId");
CREATE UNIQUE INDEX "fico_ar_documents_sourceSalesInvoiceId_key" ON "fico_ar_documents"("sourceSalesInvoiceId");
CREATE UNIQUE INDEX "fico_ar_documents_journalEntryId_key" ON "fico_ar_documents"("journalEntryId");
CREATE UNIQUE INDEX "fico_ar_documents_reversalJournalEntryId_key" ON "fico_ar_documents"("reversalJournalEntryId");
CREATE UNIQUE INDEX "fico_ar_open_items_documentId_key" ON "fico_ar_open_items"("documentId");
CREATE UNIQUE INDEX "fico_ar_payments_paymentNumber_key" ON "fico_ar_payments"("paymentNumber");
CREATE UNIQUE INDEX "fico_ar_payments_idempotencyKey_key" ON "fico_ar_payments"("idempotencyKey");
CREATE UNIQUE INDEX "fico_ar_payments_journalEntryId_key" ON "fico_ar_payments"("journalEntryId");
CREATE UNIQUE INDEX "fico_ar_payments_reversalJournalEntryId_key" ON "fico_ar_payments"("reversalJournalEntryId");
CREATE UNIQUE INDEX "fico_ar_clearings_clearingNumber_key" ON "fico_ar_clearings"("clearingNumber");
CREATE UNIQUE INDEX "fico_ar_clearings_idempotencyKey_key" ON "fico_ar_clearings"("idempotencyKey");
CREATE UNIQUE INDEX "fico_ar_clearings_journalEntryId_key" ON "fico_ar_clearings"("journalEntryId");
CREATE UNIQUE INDEX "fico_ar_clearings_reversalJournalEntryId_key" ON "fico_ar_clearings"("reversalJournalEntryId");
CREATE UNIQUE INDEX "fico_ar_payment_allocations_paymentId_openItemId_key" ON "fico_ar_payment_allocations"("paymentId", "openItemId");
CREATE UNIQUE INDEX "fico_ar_clearing_lines_clearingId_debitOpenItemId_creditOpenItemI_key" ON "fico_ar_clearing_lines"("clearingId", "debitOpenItemId", "creditOpenItemId");
CREATE UNIQUE INDEX "fico_ar_document_lines_documentId_lineNumber_key" ON "fico_ar_document_lines"("documentId", "lineNumber");

CREATE INDEX "fico_ar_documents_companyId_customerId_status_idx" ON "fico_ar_documents"("companyId", "customerId", "status");
CREATE INDEX "fico_ar_documents_companyId_dueDate_idx" ON "fico_ar_documents"("companyId", "dueDate");
CREATE INDEX "fico_ar_open_items_companyId_customerId_status_idx" ON "fico_ar_open_items"("companyId", "customerId", "status");
CREATE INDEX "fico_ar_open_items_companyId_dueDate_status_idx" ON "fico_ar_open_items"("companyId", "dueDate", "status");
CREATE INDEX "fico_journal_entries_customerId_idx" ON "fico_journal_entries"("customerId");

ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_customer_company_accounts" ADD CONSTRAINT "fico_customer_company_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_customer_company_accounts" ADD CONSTRAINT "fico_customer_company_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_customer_company_accounts" ADD CONSTRAINT "fico_customer_company_accounts_reconciliationAccountId_fkey" FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_customer_company_accounts" ADD CONSTRAINT "fico_customer_company_accounts_paymentTermsId_fkey" FOREIGN KEY ("paymentTermsId") REFERENCES "mm_payment_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_customer_company_accounts" ADD CONSTRAINT "fico_customer_company_accounts_defaultSalesTaxCodeId_fkey" FOREIGN KEY ("defaultSalesTaxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_credit_profiles" ADD CONSTRAINT "fico_ar_credit_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_credit_profiles" ADD CONSTRAINT "fico_ar_credit_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_customerCompanyAccountId_fkey" FOREIGN KEY ("customerCompanyAccountId") REFERENCES "fico_customer_company_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_sourceSalesInvoiceId_fkey" FOREIGN KEY ("sourceSalesInvoiceId") REFERENCES "sd_sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_originalDocumentId_fkey" FOREIGN KEY ("originalDocumentId") REFERENCES "fico_ar_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_reconciliationAccountId_fkey" FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_documents" ADD CONSTRAINT "fico_ar_documents_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_document_lines" ADD CONSTRAINT "fico_ar_document_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fico_ar_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fico_ar_open_items" ADD CONSTRAINT "fico_ar_open_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items" ADD CONSTRAINT "fico_ar_open_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items" ADD CONSTRAINT "fico_ar_open_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fico_ar_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_open_items" ADD CONSTRAINT "fico_ar_open_items_reconciliationAccountId_fkey" FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_payments" ADD CONSTRAINT "fico_ar_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_payments" ADD CONSTRAINT "fico_ar_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_payments" ADD CONSTRAINT "fico_ar_payments_customerCompanyAccountId_fkey" FOREIGN KEY ("customerCompanyAccountId") REFERENCES "fico_customer_company_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_payments" ADD CONSTRAINT "fico_ar_payments_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_payments" ADD CONSTRAINT "fico_ar_payments_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_payment_allocations" ADD CONSTRAINT "fico_ar_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "fico_ar_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_payment_allocations" ADD CONSTRAINT "fico_ar_payment_allocations_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "fico_ar_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_clearings" ADD CONSTRAINT "fico_ar_clearings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_clearings" ADD CONSTRAINT "fico_ar_clearings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sd_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_clearings" ADD CONSTRAINT "fico_ar_clearings_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_clearings" ADD CONSTRAINT "fico_ar_clearings_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ar_clearing_lines" ADD CONSTRAINT "fico_ar_clearing_lines_clearingId_fkey" FOREIGN KEY ("clearingId") REFERENCES "fico_ar_clearings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_clearing_lines" ADD CONSTRAINT "fico_ar_clearing_lines_debitOpenItemId_fkey" FOREIGN KEY ("debitOpenItemId") REFERENCES "fico_ar_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ar_clearing_lines" ADD CONSTRAINT "fico_ar_clearing_lines_creditOpenItemId_fkey" FOREIGN KEY ("creditOpenItemId") REFERENCES "fico_ar_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;