-- Allow SD POS collection and AR automatic journal document types
-- (PosCollectionCompleted was failing with document_type_check violation).

ALTER TABLE "fico_journal_entries"
    DROP CONSTRAINT IF EXISTS "fico_journal_entries_document_type_check";

ALTER TABLE "fico_journal_entries"
    ADD CONSTRAINT "fico_journal_entries_document_type_check"
    CHECK ("documentType" IN (
        'JOURNAL', 'MANUAL',
        'MM_GR', 'MM_GI', 'MM_ADJUSTMENT', 'MM_REVERSAL',
        'SUPPLIER_INVOICE', 'AP_PAYMENT', 'AP_CLEARING', 'AP_CREDIT_MEMO',
        'AP_DEBIT_ADJUSTMENT', 'AP_ADVANCE', 'AP_OPENING_BALANCE', 'AP_REVERSAL',
        'SD_REVENUE', 'SD_REVERSAL', 'SD_COLLECTION',
        'CUSTOMER_INVOICE', 'AR_COLLECTION', 'AR_ADVANCE', 'AR_CREDIT_MEMO',
        'LEGACY'
    ));