-- Allow SD POS collection journals (Dr cash / Cr AR).
ALTER TABLE "fico_journal_entries"
    DROP CONSTRAINT IF EXISTS "fico_journal_entries_document_type_check";
ALTER TABLE "fico_journal_entries"
    ADD CONSTRAINT "fico_journal_entries_document_type_check"
    CHECK ("documentType" IN (
        'JOURNAL', 'MANUAL',
        'MM_GR', 'MM_GI', 'MM_ADJUSTMENT', 'MM_REVERSAL',
        'SUPPLIER_INVOICE', 'AP_PAYMENT', 'AP_CLEARING', 'AP_CREDIT_MEMO',
        'AP_DEBIT_ADJUSTMENT', 'AP_ADVANCE', 'AP_OPENING_BALANCE', 'AP_REVERSAL',
        'SD_REVENUE', 'SD_COLLECTION', 'SD_REVERSAL',
        'CUSTOMER_INVOICE', 'CUSTOMER_RECEIPT', 'CUSTOMER_CREDIT',
        'LEGACY'
    ));
