-- Optional MM supplier partner reference on journal headers (navigation only; not AP open-item).
ALTER TABLE "fico_journal_entries" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fico_journal_entries_supplierId_fkey'
  ) THEN
    ALTER TABLE "fico_journal_entries"
      ADD CONSTRAINT "fico_journal_entries_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "mm_suppliers"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "fico_journal_entries_companyId_supplierId_idx"
  ON "fico_journal_entries"("companyId", "supplierId");

CREATE INDEX IF NOT EXISTS "fico_journal_entries_supplierId_idx"
  ON "fico_journal_entries"("supplierId");
