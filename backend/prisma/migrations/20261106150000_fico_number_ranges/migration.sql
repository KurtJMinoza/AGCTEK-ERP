-- FICO Phase 2 — Document Number Ranges.
-- Additive only: creates new tables for company-specific document number
-- sequencing. No existing table is modified or duplicated.

-- ---------------------------------------------------------------------------
-- fico_number_ranges — company-specific document number range definitions.
-- ---------------------------------------------------------------------------
CREATE TABLE "fico_number_ranges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rangeCode" TEXT NOT NULL,
    "rangeName" TEXT NOT NULL,
    "description" TEXT,
    "documentCategory" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "numberingMethod" TEXT NOT NULL DEFAULT 'INTERNAL',
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "endNumber" INTEGER NOT NULL DEFAULT 999999,
    "currentNumber" INTEGER NOT NULL DEFAULT 1,
    "paddingLength" INTEGER NOT NULL DEFAULT 6,
    "validFrom" DATE,
    "validTo" DATE,
    "fiscalYearId" TEXT,
    "resetFrequency" TEXT NOT NULL DEFAULT 'NEVER',
    "allowManualAssignment" BOOLEAN NOT NULL DEFAULT true,
    "allowExternalAssignment" BOOLEAN NOT NULL DEFAULT false,
    "allowGaps" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_number_ranges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_number_ranges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_number_ranges_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fico_fiscal_year_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fico_number_ranges_start_number_check" CHECK ("startNumber" >= 1),
    CONSTRAINT "fico_number_ranges_end_number_check" CHECK ("endNumber" >= "startNumber"),
    CONSTRAINT "fico_number_ranges_current_number_check" CHECK ("currentNumber" BETWEEN "startNumber" AND "endNumber"),
    CONSTRAINT "fico_number_ranges_padding_length_check" CHECK ("paddingLength" BETWEEN 1 AND 20),
    CONSTRAINT "fico_number_ranges_reset_frequency_check" CHECK ("resetFrequency" IN ('NEVER', 'ANNUALLY', 'PER_FISCAL_YEAR')),
    CONSTRAINT "fico_number_ranges_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'EXHAUSTED')),
    CONSTRAINT "fico_number_ranges_assignment_type_check" CHECK ("assignmentType" IN ('INTERNAL', 'EXTERNAL')),
    CONSTRAINT "fico_number_ranges_numbering_method_check" CHECK ("numberingMethod" IN ('INTERNAL', 'EXTERNAL')),
    CONSTRAINT "fico_number_ranges_validity_check" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom")
);

CREATE UNIQUE INDEX "fico_number_ranges_companyId_rangeCode_key" ON "fico_number_ranges"("companyId", "rangeCode");
CREATE INDEX "fico_number_ranges_companyId_status_idx" ON "fico_number_ranges"("companyId", "status");
CREATE INDEX "fico_number_ranges_companyId_documentCategory_idx" ON "fico_number_ranges"("companyId", "documentCategory");
CREATE INDEX "fico_number_ranges_fiscalYearId_idx" ON "fico_number_ranges"("fiscalYearId");

-- ---------------------------------------------------------------------------
-- fico_number_range_logs — append-only number assignment audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE "fico_number_range_logs" (
    "id" TEXT NOT NULL,
    "numberRangeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYearId" TEXT,
    "generatedNumber" TEXT NOT NULL,
    "numericSequence" INTEGER NOT NULL,
    "assignmentMethod" TEXT NOT NULL DEFAULT 'INTERNAL',
    "documentReference" TEXT,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fico_number_range_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_number_range_logs_numberRangeId_fkey" FOREIGN KEY ("numberRangeId") REFERENCES "fico_number_ranges"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_number_range_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fico_number_range_logs_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fico_fiscal_year_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fico_number_range_logs_assignment_method_check" CHECK ("assignmentMethod" IN ('INTERNAL', 'EXTERNAL'))
);

CREATE INDEX "fico_number_range_logs_numberRangeId_assignedAt_idx" ON "fico_number_range_logs"("numberRangeId", "assignedAt");
CREATE INDEX "fico_number_range_logs_companyId_generatedNumber_idx" ON "fico_number_range_logs"("companyId", "generatedNumber");
CREATE INDEX "fico_number_range_logs_fiscalYearId_idx" ON "fico_number_range_logs"("fiscalYearId");

-- ---------------------------------------------------------------------------
-- Company relation: add reverse relation for number ranges and logs.
-- (Company model already exists; reverse relations are expressed in Prisma
--  schema and enforced by the foreign keys above.)
-- ---------------------------------------------------------------------------
