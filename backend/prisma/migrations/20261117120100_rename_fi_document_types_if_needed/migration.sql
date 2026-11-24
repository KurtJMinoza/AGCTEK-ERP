-- If an earlier fico-branch install created the FI master as fico_document_types
-- (simple number-range shape, no companyId), rename it so Phase 2 can own
-- fico_document_types.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fico_document_types'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fico_document_types' AND column_name = 'numberRangeFrom'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fico_document_types' AND column_name = 'companyId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fi_document_types'
  ) THEN
    ALTER TABLE "fico_document_types" RENAME TO "fi_document_types";
    ALTER INDEX IF EXISTS "fico_document_types_pkey" RENAME TO "fi_document_types_pkey";
    ALTER INDEX IF EXISTS "fico_document_types_code_key" RENAME TO "fi_document_types_code_key";
    ALTER INDEX IF EXISTS "fico_document_types_isActive_idx" RENAME TO "fi_document_types_isActive_idx";
  END IF;
END $$;
