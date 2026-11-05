-- FICO Phase 1 — FI document types and manual journal entry metadata.
-- Additive only: new master table plus nullable journal columns.

CREATE TABLE "fico_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT,
    "numberRangeFrom" INTEGER NOT NULL DEFAULT 1,
    "numberRangeTo" INTEGER NOT NULL DEFAULT 999999999,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "allowsManualEntry" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_document_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fico_document_types_range_check" CHECK ("numberRangeFrom" > 0 AND "numberRangeTo" >= "numberRangeFrom"),
    CONSTRAINT "fico_document_types_next_check" CHECK ("nextNumber" BETWEEN "numberRangeFrom" AND "numberRangeTo" + 1)
);

CREATE UNIQUE INDEX "fico_document_types_code_key" ON "fico_document_types"("code");
CREATE INDEX "fico_document_types_isActive_idx" ON "fico_document_types"("isActive");

ALTER TABLE "fico_journal_entries"
    ADD COLUMN "documentTypeId" TEXT,
    ADD COLUMN "reference" TEXT,
    ADD COLUMN "headerText" TEXT;

CREATE INDEX "fico_journal_entries_documentTypeId_idx" ON "fico_journal_entries"("documentTypeId");

ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_documentTypeId_fkey"
    FOREIGN KEY ("documentTypeId") REFERENCES "fico_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "fico_document_types" ("id", "code", "name", "prefix", "allowsManualEntry", "updatedAt") VALUES
    ('fico_dt_sa', 'SA', 'G/L Account Document', 'SA', true, CURRENT_TIMESTAMP),
    ('fico_dt_rv', 'RV', 'Customer Invoice', 'RV', false, CURRENT_TIMESTAMP),
    ('fico_dt_dz', 'DZ', 'Customer Payment', 'DZ', false, CURRENT_TIMESTAMP),
    ('fico_dt_kg', 'KG', 'Vendor Invoice', 'KG', false, CURRENT_TIMESTAMP),
    ('fico_dt_kz', 'KZ', 'Vendor Payment', 'KZ', false, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
