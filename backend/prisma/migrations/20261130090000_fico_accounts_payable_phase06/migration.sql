-- Phase 06: Accounts Payable subledger and MM invoice integration.
-- Additive only: no operational MM or journal records are changed or deleted.

ALTER TABLE "mm_supplier_invoices"
    ADD COLUMN IF NOT EXISTS "baselineDate" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "taxCodeId" TEXT,
    ADD COLUMN IF NOT EXISTS "withholdingTaxCodeId" TEXT,
    ADD COLUMN IF NOT EXISTS "paymentBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "fico_supplier_company_accounts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierAccountGroup" TEXT NOT NULL DEFAULT 'STANDARD',
    "reconciliationAccountId" TEXT,
    "paymentTermsId" TEXT,
    "defaultPaymentMethodCode" TEXT,
    "transactionCurrencyCode" VARCHAR(3),
    "defaultPurchaseTaxCodeId" TEXT,
    "withholdingTaxCodeId" TEXT,
    "taxIdentificationNumber" TEXT,
    "taxClassification" TEXT,
    "invoiceToleranceAmount" DECIMAL(18,4),
    "invoiceTolerancePercent" DECIMAL(9,4),
    "postingBlocked" BOOLEAN NOT NULL DEFAULT false,
    "paymentBlocked" BOOLEAN NOT NULL DEFAULT false,
    "alternativePayeeSupplierId" TEXT,
    "alternativePayeeAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "alternativePayeeAuthorizedBy" TEXT,
    "alternativePayeeAuthorizedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_supplier_company_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_supplier_bank_approvals" (
    "id" TEXT NOT NULL,
    "supplierCompanyAccountId" TEXT NOT NULL,
    "supplierBankAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_supplier_bank_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_ap_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierCompanyAccountId" TEXT,
    "sourceSupplierInvoiceId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "originalDocumentId" TEXT,
    "historicalBackpostingRunId" TEXT,
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
    "withholdingAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "liabilityAmount" DECIMAL(18,4) NOT NULL,
    "reconciliationAccountId" TEXT,
    "reconciliationAccountCode" TEXT,
    "taxCodeId" TEXT,
    "withholdingTaxCodeId" TEXT,
    "paymentBlocked" BOOLEAN NOT NULL DEFAULT false,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ap_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_documents_non_negative_check" CHECK (
        "netAmount" >= 0 AND "taxAmount" >= 0 AND "withholdingAmount" >= 0
        AND "grossAmount" >= 0 AND "liabilityAmount" >= 0
    )
);

CREATE TABLE "fico_ap_open_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reconciliationAccountId" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'INVOICE',
    "direction" TEXT NOT NULL DEFAULT 'CREDIT',
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "openAmount" DECIMAL(18,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "baselineDate" DATE NOT NULL,
    "dueDate" DATE,
    "paymentBlocked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ap_open_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_open_items_amount_check" CHECK ("originalAmount" >= 0 AND "openAmount" >= 0)
);

CREATE TABLE "fico_ap_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierCompanyAccountId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "supplierBankApprovalId" TEXT,
    "paymentNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
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
    CONSTRAINT "fico_ap_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_payments_amount_check" CHECK ("totalAmount" > 0)
);

CREATE TABLE "fico_ap_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "openItemId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLEARED',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ap_payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_payment_allocations_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "fico_ap_clearings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
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
    CONSTRAINT "fico_ap_clearings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_clearings_amount_check" CHECK ("totalAmount" > 0)
);

CREATE TABLE "fico_ap_clearing_allocations" (
    "id" TEXT NOT NULL,
    "clearingId" TEXT NOT NULL,
    "debitOpenItemId" TEXT NOT NULL,
    "creditOpenItemId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLEARED',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_ap_clearing_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_clearing_allocations_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "fico_ap_grir_allocations" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT NOT NULL,
    "allocatedQuantity" DECIMAL(18,4) NOT NULL,
    "allocatedAmount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_ap_grir_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_ap_grir_allocations_non_negative_check" CHECK ("allocatedQuantity" >= 0 AND "allocatedAmount" >= 0)
);

CREATE UNIQUE INDEX "fico_supplier_company_accounts_supplierId_companyId_key"
    ON "fico_supplier_company_accounts"("supplierId", "companyId");
CREATE INDEX "fico_supplier_company_accounts_companyId_status_idx"
    ON "fico_supplier_company_accounts"("companyId", "status");
CREATE INDEX "fico_supplier_company_accounts_companyId_supplierAccountGroup_idx"
    ON "fico_supplier_company_accounts"("companyId", "supplierAccountGroup");
CREATE INDEX "fico_supplier_company_accounts_reconciliationAccountId_idx"
    ON "fico_supplier_company_accounts"("reconciliationAccountId");

CREATE UNIQUE INDEX "fico_supplier_bank_approvals_supplierCompanyAccountId_supplierBankAccountId_key"
    ON "fico_supplier_bank_approvals"("supplierCompanyAccountId", "supplierBankAccountId");
CREATE INDEX "fico_supplier_bank_approvals_companyId_status_idx"
    ON "fico_supplier_bank_approvals"("companyId", "status");
CREATE INDEX "fico_supplier_bank_approvals_supplierBankAccountId_idx"
    ON "fico_supplier_bank_approvals"("supplierBankAccountId");

CREATE UNIQUE INDEX "fico_ap_documents_sourceSupplierInvoiceId_key"
    ON "fico_ap_documents"("sourceSupplierInvoiceId");
CREATE UNIQUE INDEX "fico_ap_documents_journalEntryId_key"
    ON "fico_ap_documents"("journalEntryId");
CREATE UNIQUE INDEX "fico_ap_documents_reversalJournalEntryId_key"
    ON "fico_ap_documents"("reversalJournalEntryId");
CREATE INDEX "fico_ap_documents_companyId_supplierId_status_idx"
    ON "fico_ap_documents"("companyId", "supplierId", "status");
CREATE INDEX "fico_ap_documents_companyId_dueDate_idx"
    ON "fico_ap_documents"("companyId", "dueDate");
CREATE INDEX "fico_ap_documents_reconciliationAccountId_idx"
    ON "fico_ap_documents"("reconciliationAccountId");
CREATE INDEX "fico_ap_documents_historicalBackpostingRunId_idx"
    ON "fico_ap_documents"("historicalBackpostingRunId");

CREATE UNIQUE INDEX "fico_ap_open_items_documentId_key"
    ON "fico_ap_open_items"("documentId");
CREATE INDEX "fico_ap_open_items_companyId_supplierId_status_idx"
    ON "fico_ap_open_items"("companyId", "supplierId", "status");
CREATE INDEX "fico_ap_open_items_companyId_dueDate_status_idx"
    ON "fico_ap_open_items"("companyId", "dueDate", "status");
CREATE INDEX "fico_ap_open_items_reconciliationAccountId_status_idx"
    ON "fico_ap_open_items"("reconciliationAccountId", "status");

CREATE UNIQUE INDEX "fico_ap_payments_journalEntryId_key"
    ON "fico_ap_payments"("journalEntryId");
CREATE UNIQUE INDEX "fico_ap_payments_reversalJournalEntryId_key"
    ON "fico_ap_payments"("reversalJournalEntryId");
CREATE UNIQUE INDEX "fico_ap_payments_paymentNumber_key"
    ON "fico_ap_payments"("paymentNumber");
CREATE UNIQUE INDEX "fico_ap_payments_idempotencyKey_key"
    ON "fico_ap_payments"("idempotencyKey");
CREATE INDEX "fico_ap_payments_companyId_supplierId_status_idx"
    ON "fico_ap_payments"("companyId", "supplierId", "status");
CREATE INDEX "fico_ap_payments_companyId_paymentDate_idx"
    ON "fico_ap_payments"("companyId", "paymentDate");

CREATE UNIQUE INDEX "fico_ap_payment_allocations_paymentId_openItemId_key"
    ON "fico_ap_payment_allocations"("paymentId", "openItemId");
CREATE INDEX "fico_ap_payment_allocations_openItemId_status_idx"
    ON "fico_ap_payment_allocations"("openItemId", "status");

CREATE UNIQUE INDEX "fico_ap_clearings_journalEntryId_key"
    ON "fico_ap_clearings"("journalEntryId");
CREATE UNIQUE INDEX "fico_ap_clearings_reversalJournalEntryId_key"
    ON "fico_ap_clearings"("reversalJournalEntryId");
CREATE UNIQUE INDEX "fico_ap_clearings_clearingNumber_key"
    ON "fico_ap_clearings"("clearingNumber");
CREATE UNIQUE INDEX "fico_ap_clearings_idempotencyKey_key"
    ON "fico_ap_clearings"("idempotencyKey");
CREATE INDEX "fico_ap_clearings_companyId_supplierId_status_idx"
    ON "fico_ap_clearings"("companyId", "supplierId", "status");
CREATE INDEX "fico_ap_clearings_companyId_clearingDate_idx"
    ON "fico_ap_clearings"("companyId", "clearingDate");

CREATE UNIQUE INDEX "fico_ap_clearing_allocations_clearingId_debitOpenItemId_creditOpenItemId_key"
    ON "fico_ap_clearing_allocations"("clearingId", "debitOpenItemId", "creditOpenItemId");
CREATE INDEX "fico_ap_clearing_allocations_debitOpenItemId_status_idx"
    ON "fico_ap_clearing_allocations"("debitOpenItemId", "status");
CREATE INDEX "fico_ap_clearing_allocations_creditOpenItemId_status_idx"
    ON "fico_ap_clearing_allocations"("creditOpenItemId", "status");

CREATE UNIQUE INDEX "fico_ap_grir_allocations_documentId_invoiceLineId_goodsReceiptLineId_key"
    ON "fico_ap_grir_allocations"("documentId", "invoiceLineId", "goodsReceiptLineId");
CREATE INDEX "fico_ap_grir_allocations_goodsReceiptLineId_idx"
    ON "fico_ap_grir_allocations"("goodsReceiptLineId");
CREATE INDEX "fico_ap_grir_allocations_invoiceLineId_idx"
    ON "fico_ap_grir_allocations"("invoiceLineId");

CREATE INDEX "mm_supplier_invoices_taxCodeId_idx" ON "mm_supplier_invoices"("taxCodeId");
CREATE INDEX "mm_supplier_invoices_withholdingTaxCodeId_idx" ON "mm_supplier_invoices"("withholdingTaxCodeId");

ALTER TABLE "mm_supplier_invoices"
    ADD CONSTRAINT "mm_supplier_invoices_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mm_supplier_invoices"
    ADD CONSTRAINT "mm_supplier_invoices_withholdingTaxCodeId_fkey"
    FOREIGN KEY ("withholdingTaxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_reconciliationAccountId_fkey"
    FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_paymentTermsId_fkey"
    FOREIGN KEY ("paymentTermsId") REFERENCES "mm_payment_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_defaultPurchaseTaxCodeId_fkey"
    FOREIGN KEY ("defaultPurchaseTaxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_withholdingTaxCodeId_fkey"
    FOREIGN KEY ("withholdingTaxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_company_accounts"
    ADD CONSTRAINT "fico_supplier_company_accounts_alternativePayeeSupplierId_fkey"
    FOREIGN KEY ("alternativePayeeSupplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_supplier_bank_approvals"
    ADD CONSTRAINT "fico_supplier_bank_approvals_supplierCompanyAccountId_fkey"
    FOREIGN KEY ("supplierCompanyAccountId") REFERENCES "fico_supplier_company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_bank_approvals"
    ADD CONSTRAINT "fico_supplier_bank_approvals_supplierBankAccountId_fkey"
    FOREIGN KEY ("supplierBankAccountId") REFERENCES "mm_supplier_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_supplier_bank_approvals"
    ADD CONSTRAINT "fico_supplier_bank_approvals_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_supplierCompanyAccountId_fkey"
    FOREIGN KEY ("supplierCompanyAccountId") REFERENCES "fico_supplier_company_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_sourceSupplierInvoiceId_fkey"
    FOREIGN KEY ("sourceSupplierInvoiceId") REFERENCES "mm_supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_reversalJournalEntryId_fkey"
    FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_originalDocumentId_fkey"
    FOREIGN KEY ("originalDocumentId") REFERENCES "fico_ap_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_historicalBackpostingRunId_fkey"
    FOREIGN KEY ("historicalBackpostingRunId") REFERENCES "fico_historical_backposting_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_reconciliationAccountId_fkey"
    FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_documents"
    ADD CONSTRAINT "fico_ap_documents_withholdingTaxCodeId_fkey"
    FOREIGN KEY ("withholdingTaxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_open_items"
    ADD CONSTRAINT "fico_ap_open_items_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_open_items"
    ADD CONSTRAINT "fico_ap_open_items_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_open_items"
    ADD CONSTRAINT "fico_ap_open_items_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "fico_ap_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_open_items"
    ADD CONSTRAINT "fico_ap_open_items_reconciliationAccountId_fkey"
    FOREIGN KEY ("reconciliationAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_supplierCompanyAccountId_fkey"
    FOREIGN KEY ("supplierCompanyAccountId") REFERENCES "fico_supplier_company_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_reversalJournalEntryId_fkey"
    FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payments"
    ADD CONSTRAINT "fico_ap_payments_supplierBankApprovalId_fkey"
    FOREIGN KEY ("supplierBankApprovalId") REFERENCES "fico_supplier_bank_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_payment_allocations"
    ADD CONSTRAINT "fico_ap_payment_allocations_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "fico_ap_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_payment_allocations"
    ADD CONSTRAINT "fico_ap_payment_allocations_openItemId_fkey"
    FOREIGN KEY ("openItemId") REFERENCES "fico_ap_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_clearings"
    ADD CONSTRAINT "fico_ap_clearings_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_clearings"
    ADD CONSTRAINT "fico_ap_clearings_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_clearings"
    ADD CONSTRAINT "fico_ap_clearings_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_clearings"
    ADD CONSTRAINT "fico_ap_clearings_reversalJournalEntryId_fkey"
    FOREIGN KEY ("reversalJournalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_clearing_allocations"
    ADD CONSTRAINT "fico_ap_clearing_allocations_clearingId_fkey"
    FOREIGN KEY ("clearingId") REFERENCES "fico_ap_clearings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_clearing_allocations"
    ADD CONSTRAINT "fico_ap_clearing_allocations_debitOpenItemId_fkey"
    FOREIGN KEY ("debitOpenItemId") REFERENCES "fico_ap_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_ap_clearing_allocations"
    ADD CONSTRAINT "fico_ap_clearing_allocations_creditOpenItemId_fkey"
    FOREIGN KEY ("creditOpenItemId") REFERENCES "fico_ap_open_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_ap_grir_allocations"
    ADD CONSTRAINT "fico_ap_grir_allocations_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "fico_ap_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Journal document types remain controlled; only AP-specific types are added.
ALTER TABLE "fico_journal_entries"
    DROP CONSTRAINT IF EXISTS "fico_journal_entries_document_type_check";
ALTER TABLE "fico_journal_entries"
    ADD CONSTRAINT "fico_journal_entries_document_type_check"
    CHECK ("documentType" IN (
        'JOURNAL', 'MANUAL',
        'MM_GR', 'MM_GI', 'MM_ADJUSTMENT', 'MM_REVERSAL',
        'SUPPLIER_INVOICE', 'AP_PAYMENT', 'AP_CLEARING', 'AP_CREDIT_MEMO',
        'AP_DEBIT_ADJUSTMENT', 'AP_ADVANCE', 'AP_OPENING_BALANCE', 'AP_REVERSAL',
        'SD_REVENUE', 'SD_REVERSAL',
        'LEGACY'
    ));
