-- Allow SD revenue and reversal journal document types.
ALTER TABLE "fico_journal_entries"
    DROP CONSTRAINT "fico_journal_entries_document_type_check";
ALTER TABLE "fico_journal_entries"
    ADD CONSTRAINT "fico_journal_entries_document_type_check"
    CHECK ("documentType" IN (
        'JOURNAL', 'MANUAL',
        'MM_GR', 'MM_GI', 'MM_ADJUSTMENT', 'MM_REVERSAL',
        'SUPPLIER_INVOICE',
        'SD_REVENUE', 'SD_REVERSAL',
        'LEGACY'
    ));
