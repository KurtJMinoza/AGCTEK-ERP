-- FICO Ph1: centralized G/L account determination for MM and SD.
-- Additive only: two new tables plus their foreign keys, uniques and CHECKs.

CREATE TABLE "fico_account_determination_rules" (
    "id" TEXT NOT NULL,
    "determinationCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "companyId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "transactionKeyCode" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "valuationClassId" TEXT,
    "materialTypeCode" TEXT,
    "movementType" TEXT,
    "customerAccountGroup" TEXT,
    "salesOrganization" TEXT,
    "distributionChannel" TEXT,
    "changeReason" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_account_determination_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_account_determination_lines" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fico_account_determination_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_account_determination_rules_determinationCode_key"
    ON "fico_account_determination_rules"("determinationCode");
CREATE INDEX "fico_account_determination_rules_companyId_sourceModule_transactionType_status_idx"
    ON "fico_account_determination_rules"("companyId", "sourceModule", "transactionType", "status");
CREATE INDEX "fico_account_determination_rules_companyId_sourceModule_status_priority_idx"
    ON "fico_account_determination_rules"("companyId", "sourceModule", "status", "priority");
CREATE INDEX "fico_account_determination_rules_valuationClassId_idx"
    ON "fico_account_determination_rules"("valuationClassId");
CREATE INDEX "fico_account_determination_rules_materialTypeCode_idx"
    ON "fico_account_determination_rules"("materialTypeCode");

CREATE UNIQUE INDEX "fico_account_determination_lines_ruleId_lineNumber_key"
    ON "fico_account_determination_lines"("ruleId", "lineNumber");
CREATE INDEX "fico_account_determination_lines_glAccountId_idx"
    ON "fico_account_determination_lines"("glAccountId");

ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_account_determination_rules_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_account_determination_rules_transactionKeyCode_fkey"
    FOREIGN KEY ("transactionKeyCode") REFERENCES "fico_transaction_keys"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_account_determination_rules_valuationClassId_fkey"
    FOREIGN KEY ("valuationClassId") REFERENCES "mm_valuation_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_account_determination_rules_materialTypeCode_fkey"
    FOREIGN KEY ("materialTypeCode") REFERENCES "mm_material_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_account_determination_lines"
    ADD CONSTRAINT "fico_account_determination_lines_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "fico_account_determination_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fico_account_determination_lines"
    ADD CONSTRAINT "fico_account_determination_lines_glAccountId_fkey"
    FOREIGN KEY ("glAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enum-like guards and business invariants the application also enforces.
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_module_check"
    CHECK ("sourceModule" IN ('MM', 'SD'));
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_status_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED'));
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_priority_check"
    CHECK ("priority" BETWEEN 1 AND 9999);
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_effective_check"
    CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
-- An ACTIVE rule must carry the approval and activation evidence.
ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_active_check"
    CHECK (
        "status" <> 'ACTIVE'
        OR ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL
            AND "activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL)
    );

ALTER TABLE "fico_account_determination_lines"
    ADD CONSTRAINT "fico_determination_lines_side_check"
    CHECK ("side" IN ('DEBIT', 'CREDIT'));
ALTER TABLE "fico_account_determination_lines"
    ADD CONSTRAINT "fico_determination_lines_number_check"
    CHECK ("lineNumber" >= 1);
