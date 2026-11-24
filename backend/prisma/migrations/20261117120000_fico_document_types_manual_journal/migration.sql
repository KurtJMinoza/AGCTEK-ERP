-- FICO Phase 1 — FI document types and manual journal entry metadata.
-- Additive only: new master table plus nullable journal columns.
-- Table is fi_document_types so it does not collide with Phase 2 company
-- document types in fico_document_types.

CREATE TABLE "fi_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "prefix" TEXT,
    "padding" INTEGER,
    "numberRangeFrom" INTEGER NOT NULL DEFAULT 1,
    "numberRangeTo" INTEGER NOT NULL DEFAULT 999999999,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "allowsManualEntry" BOOLEAN NOT NULL DEFAULT true,
    "allowsReversal" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fi_document_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fi_document_types_range_check" CHECK ("numberRangeFrom" > 0 AND "numberRangeTo" >= "numberRangeFrom"),
    CONSTRAINT "fi_document_types_next_check" CHECK ("nextNumber" BETWEEN "numberRangeFrom" AND "numberRangeTo" + 1)
);

CREATE UNIQUE INDEX "fi_document_types_code_key" ON "fi_document_types"("code");
CREATE INDEX "fi_document_types_isActive_idx" ON "fi_document_types"("isActive");
CREATE INDEX "fi_document_types_category_idx" ON "fi_document_types"("category");

ALTER TABLE "fico_journal_entries"
    ADD COLUMN IF NOT EXISTS "documentTypeId" TEXT,
    ADD COLUMN IF NOT EXISTS "reference" TEXT,
    ADD COLUMN IF NOT EXISTS "headerText" TEXT;

CREATE INDEX IF NOT EXISTS "fico_journal_entries_documentTypeId_idx" ON "fico_journal_entries"("documentTypeId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fico_journal_entries_documentTypeId_fkey'
    ) THEN
        ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_documentTypeId_fkey"
            FOREIGN KEY ("documentTypeId") REFERENCES "fi_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "fi_document_types" ("id", "code", "name", "prefix", "allowsManualEntry", "updatedAt") VALUES
    ('fico_dt_sa', 'SA', 'G/L Account Document', 'SA', true, CURRENT_TIMESTAMP),
    ('fico_dt_rv', 'RV', 'Customer Invoice', 'RV', false, CURRENT_TIMESTAMP),
    ('fico_dt_dz', 'DZ', 'Customer Payment', 'DZ', false, CURRENT_TIMESTAMP),
    ('fico_dt_kg', 'KG', 'Vendor Invoice', 'KG', false, CURRENT_TIMESTAMP),
    ('fico_dt_kz', 'KZ', 'Vendor Payment', 'KZ', false, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
