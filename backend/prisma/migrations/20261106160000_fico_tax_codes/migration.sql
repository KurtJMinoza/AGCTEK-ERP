-- FICO Phase 2 — Company Accounting Tax Codes.
-- Additive only: creates new tables for company-specific tax code configuration.
-- No existing table is modified or duplicated.

-- ---------------------------------------------------------------------------
-- fico_tax_codes — company-specific tax code definitions with posting controls.
-- ---------------------------------------------------------------------------
CREATE TABLE "fico_tax_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "taxCategory" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "taxJurisdiction" TEXT,
    "countryCode" VARCHAR(2),
    "calculationMethod" TEXT NOT NULL DEFAULT 'TAX_EXCLUSIVE',
    "rateUnit" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "roundingMethod" TEXT NOT NULL DEFAULT 'HALF_UP',
    "decimalPrecision" INTEGER NOT NULL DEFAULT 2,
    "roundingLevel" TEXT NOT NULL DEFAULT 'PER_LINE_ITEM',
    "calculationPriority" INTEGER NOT NULL DEFAULT 0,
    "isSalesApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isPurchaseApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isServiceApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isInventoryApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isRecoverable" BOOLEAN NOT NULL DEFAULT true,
    "inputTaxGlAccountId" TEXT,
    "outputTaxGlAccountId" TEXT,
    "withholdingPayableGlAccountId" TEXT,
    "withholdingReceivableGlAccountId" TEXT,
    "nonRecoverableTaxGlAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_tax_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_tax_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_inputTaxGlAccountId_fkey" FOREIGN KEY ("inputTaxGlAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_outputTaxGlAccountId_fkey" FOREIGN KEY ("outputTaxGlAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_withholdingPayableGlAccountId_fkey" FOREIGN KEY ("withholdingPayableGlAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_withholdingReceivableGlAccountId_fkey" FOREIGN KEY ("withholdingReceivableGlAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_nonRecoverableTaxGlAccountId_fkey" FOREIGN KEY ("nonRecoverableTaxGlAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_codes_decimalPrecision_check" CHECK ("decimalPrecision" BETWEEN 0 AND 10),
    CONSTRAINT "fico_tax_codes_rateUnit_check" CHECK ("rateUnit" IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    CONSTRAINT "fico_tax_codes_calculationMethod_check" CHECK ("calculationMethod" IN ('TAX_EXCLUSIVE', 'TAX_INCLUSIVE', 'NOT_APPLICABLE')),
    CONSTRAINT "fico_tax_codes_roundingMethod_check" CHECK ("roundingMethod" IN ('HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'UP', 'DOWN')),
    CONSTRAINT "fico_tax_codes_roundingLevel_check" CHECK ("roundingLevel" IN ('PER_LINE_ITEM', 'PER_DOCUMENT')),
    CONSTRAINT "fico_tax_codes_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
    CONSTRAINT "fico_tax_codes_taxCategory_check" CHECK ("taxCategory" IN ('SALES_TAX', 'PURCHASE_TAX', 'INPUT_TAX', 'OUTPUT_TAX', 'WITHHOLDING_TAX', 'OTHER_TAX')),
    CONSTRAINT "fico_tax_codes_taxType_check" CHECK ("taxType" IN ('VAT', 'PERCENTAGE_TAX', 'WITHHOLDING_TAX', 'ZERO_RATED_TAX', 'EXEMPT_TAX', 'NON_TAXABLE', 'OTHER_TAX'))
);

CREATE UNIQUE INDEX "fico_tax_codes_companyId_code_key" ON "fico_tax_codes"("companyId", "code");
CREATE INDEX "fico_tax_codes_companyId_status_idx" ON "fico_tax_codes"("companyId", "status");
CREATE INDEX "fico_tax_codes_companyId_taxCategory_idx" ON "fico_tax_codes"("companyId", "taxCategory");
CREATE INDEX "fico_tax_codes_companyId_taxType_idx" ON "fico_tax_codes"("companyId", "taxType");
CREATE INDEX "fico_tax_codes_companyId_isSalesApplicable_idx" ON "fico_tax_codes"("companyId", "isSalesApplicable");
CREATE INDEX "fico_tax_codes_companyId_isPurchaseApplicable_idx" ON "fico_tax_codes"("companyId", "isPurchaseApplicable");
CREATE INDEX "fico_tax_codes_companyId_taxJurisdiction_idx" ON "fico_tax_codes"("companyId", "taxJurisdiction");

-- ---------------------------------------------------------------------------
-- fico_tax_rates — effective-dated tax rates for a tax code.
-- ---------------------------------------------------------------------------
CREATE TABLE "fico_tax_rates" (
    "id" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "rateUnit" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_tax_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_tax_rates_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_rates_rateUnit_check" CHECK ("rateUnit" IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    CONSTRAINT "fico_tax_rates_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'EXPIRED', 'SCHEDULED')),
    CONSTRAINT "fico_tax_rates_effectiveDate_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE INDEX "fico_tax_rates_taxCodeId_effectiveFrom_idx" ON "fico_tax_rates"("taxCodeId", "effectiveFrom");
CREATE INDEX "fico_tax_rates_taxCodeId_effectiveTo_idx" ON "fico_tax_rates"("taxCodeId", "effectiveTo");
CREATE INDEX "fico_tax_rates_companyId_status_idx" ON "fico_tax_rates"("companyId", "status");
CREATE INDEX "fico_tax_rates_companyId_rateUnit_idx" ON "fico_tax_rates"("companyId", "rateUnit");

-- ---------------------------------------------------------------------------
-- fico_tax_code_audit_logs — append-only audit trail for tax code changes.
-- ---------------------------------------------------------------------------
CREATE TABLE "fico_tax_code_audit_logs" (
    "id" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "previousValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_tax_code_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_tax_code_audit_logs_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_tax_code_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "fico_tax_code_audit_logs_taxCodeId_createdAt_idx" ON "fico_tax_code_audit_logs"("taxCodeId", "createdAt");
CREATE INDEX "fico_tax_code_audit_logs_companyId_createdAt_idx" ON "fico_tax_code_audit_logs"("companyId", "createdAt");
CREATE INDEX "fico_tax_code_audit_logs_action_createdAt_idx" ON "fico_tax_code_audit_logs"("action", "createdAt");
