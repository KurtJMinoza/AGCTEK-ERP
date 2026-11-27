CREATE TABLE IF NOT EXISTS "fico_treasury_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "branchId" TEXT,
    "paymentMethodCode" TEXT,
    "providerCode" TEXT,
    "bankName" TEXT,
    "accountNumberMask" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "postingBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_treasury_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fico_treasury_settlements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "settlementType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journalEntryId" TEXT,
    "fromTreasuryAccountId" TEXT,
    "toTreasuryAccountId" TEXT,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "feeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "postingDate" DATE NOT NULL,
    "valueDate" DATE,
    "paymentMethodCode" TEXT,
    "providerCode" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_treasury_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fico_treasury_bank_statement_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "direction" TEXT NOT NULL,
    "reference" TEXT,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_treasury_bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fico_tax_posting_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "taxCodeId" TEXT NOT NULL,
    "taxCodeCode" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "calculationMethod" TEXT NOT NULL,
    "rateApplied" DECIMAL(18,6) NOT NULL,
    "rateUnit" TEXT NOT NULL,
    "netAmount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "recoverableTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "nonRecoverableTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "withholdingPayable" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "withholdingReceivable" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "postingDate" DATE NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_tax_posting_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_accounts_companyId_accountCode_key" ON "fico_treasury_accounts"("companyId", "accountCode");
CREATE INDEX IF NOT EXISTS "fico_treasury_accounts_companyId_accountKind_status_idx" ON "fico_treasury_accounts"("companyId", "accountKind", "status");
CREATE INDEX IF NOT EXISTS "fico_treasury_accounts_companyId_paymentMethodCode_idx" ON "fico_treasury_accounts"("companyId", "paymentMethodCode");
CREATE INDEX IF NOT EXISTS "fico_treasury_accounts_branchId_idx" ON "fico_treasury_accounts"("branchId");

CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_settlements_journalEntryId_key" ON "fico_treasury_settlements"("journalEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_settlements_idempotencyKey_key" ON "fico_treasury_settlements"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_settlements_companyId_settlementNumber_key" ON "fico_treasury_settlements"("companyId", "settlementNumber");
CREATE INDEX IF NOT EXISTS "fico_treasury_settlements_companyId_settlementType_postingDate_idx" ON "fico_treasury_settlements"("companyId", "settlementType", "postingDate");

CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_bank_statement_lines_treasuryAccountId_externalId_key" ON "fico_treasury_bank_statement_lines"("treasuryAccountId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "fico_treasury_bank_statement_lines_journalEntryId_key" ON "fico_treasury_bank_statement_lines"("journalEntryId");
CREATE INDEX IF NOT EXISTS "fico_treasury_bank_statement_lines_companyId_status_statementDate_idx" ON "fico_treasury_bank_statement_lines"("companyId", "status", "statementDate");

CREATE UNIQUE INDEX IF NOT EXISTS "fico_tax_posting_snapshots_idempotencyKey_key" ON "fico_tax_posting_snapshots"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "fico_tax_posting_snapshots_companyId_postingDate_idx" ON "fico_tax_posting_snapshots"("companyId", "postingDate");
CREATE INDEX IF NOT EXISTS "fico_tax_posting_snapshots_companyId_taxCodeId_idx" ON "fico_tax_posting_snapshots"("companyId", "taxCodeId");
CREATE INDEX IF NOT EXISTS "fico_tax_posting_snapshots_sourceDocumentType_sourceDocumentId_idx" ON "fico_tax_posting_snapshots"("sourceDocumentType", "sourceDocumentId");

ALTER TABLE "fico_treasury_accounts" ADD CONSTRAINT "fico_treasury_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_accounts" ADD CONSTRAINT "fico_treasury_accounts_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_accounts" ADD CONSTRAINT "fico_treasury_accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fico_treasury_settlements" ADD CONSTRAINT "fico_treasury_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_settlements" ADD CONSTRAINT "fico_treasury_settlements_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_settlements" ADD CONSTRAINT "fico_treasury_settlements_fromTreasuryAccountId_fkey" FOREIGN KEY ("fromTreasuryAccountId") REFERENCES "fico_treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_settlements" ADD CONSTRAINT "fico_treasury_settlements_toTreasuryAccountId_fkey" FOREIGN KEY ("toTreasuryAccountId") REFERENCES "fico_treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_treasury_bank_statement_lines" ADD CONSTRAINT "fico_treasury_bank_statement_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_bank_statement_lines" ADD CONSTRAINT "fico_treasury_bank_statement_lines_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "fico_treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_treasury_bank_statement_lines" ADD CONSTRAINT "fico_treasury_bank_statement_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fico_tax_posting_snapshots" ADD CONSTRAINT "fico_tax_posting_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_tax_posting_snapshots" ADD CONSTRAINT "fico_tax_posting_snapshots_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fico_tax_posting_snapshots" ADD CONSTRAINT "fico_tax_posting_snapshots_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission_resources" ("id", "moduleId", "code", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'res_fico_treasury', m.id, 'fico.treasury', 'Treasury & Bank', 'Cash and bank master, settlements, reconciliation, and tax reports.', 62, true, NOW(), NOW()
FROM "modules" m
WHERE m.code = 'fico'
ON CONFLICT ("code") DO NOTHING;