export type ApSupplierRef = {
    id: string
    supplierCode: string
    supplierName: string
}

export type ApDocumentRef = {
    id: string
    documentType: string
    status: string
    referenceNumber: string | null
    postingDate: string
    journalEntryId: string | null
}

export type ApOpenItemRow = {
    id: string
    companyId: string
    supplierId: string
    documentId: string
    itemType: string
    direction: string
    originalAmount: number | string
    openAmount: number | string
    currencyCode: string
    baselineDate: string
    dueDate: string | null
    paymentBlocked: boolean
    status: string
    supplier: ApSupplierRef
    reconciliationAccount?: {
        id: string
        accountCode: string
        accountName: string
    } | null
    document?: ApDocumentRef | null
}

export type ApDocumentRow = {
    id: string
    companyId: string
    supplierId: string
    documentType: string
    status: string
    referenceNumber: string | null
    postingDate: string
    documentDate: string
    dueDate: string | null
    currencyCode: string
    netAmount: number | string
    taxAmount: number | string
    grossAmount: number | string
    supplier: ApSupplierRef
    journalEntry?: { id: string; documentNumber: string; status: string } | null
    reversalJournalEntry?: { id: string; documentNumber: string } | null
    sourceSupplierInvoice?: { id: string; invoiceNumber: string } | null
    openItem?: {
        id: string
        direction: string
        originalAmount: number | string
        openAmount: number | string
        status: string
        paymentBlocked: boolean
        dueDate: string | null
    } | null
}

export type ApPaymentRow = {
    id: string
    paymentNumber: string
    companyId: string
    supplierId: string
    paymentDate: string
    currencyCode: string
    totalAmount: number | string
    status: string
    paymentMethodCode: string | null
    paymentReference: string | null
    supplier: ApSupplierRef
    journalEntry?: { id: string; documentNumber: string; status: string } | null
    allocations?: Array<{
        id: string
        amount: number | string
        openItem?: {
            id: string
            itemType: string
            document?: { id: string; referenceNumber: string | null }
        }
    }>
}

export type ApClearingRow = {
    id: string
    clearingNumber: string
    companyId: string
    supplierId: string
    clearingDate: string
    currencyCode: string
    totalAmount: number | string
    status: string
    reference: string | null
    supplier: ApSupplierRef
    journalEntry?: { id: string; documentNumber: string; status: string } | null
    allocations?: Array<{
        id: string
        amount: number | string
        debitOpenItem?: { id: string; itemType: string; document?: { id: string; referenceNumber: string | null } }
        creditOpenItem?: { id: string; itemType: string; document?: { id: string; referenceNumber: string | null } }
    }>
}

export type ApReferenceData = {
    companyId: string
    baseCurrency: string
    bankGlAccounts: Array<{ id: string; accountCode: string; accountName: string }>
    bankRules: Array<{
        id: string
        determinationCode: string
        name: string
        paymentMethodCode: string | null
        bankAccountId: string | null
    }>
    supplierBankAccounts: Array<{
        id: string
        bankName: string
        accountNumber: string
        isPrimary: boolean
    }>
    bankApprovals: Array<{
        id: string
        status: string
        isDefault: boolean
        supplierBankAccount?: { id: string; bankName: string; accountNumber: string }
    }>
    reconciliationAccounts?: Array<{ id: string; accountCode: string; accountName: string }>
    paymentTerms?: Array<{ id: string; code: string; name: string; dueDays: number }>
    purchaseTaxCodes?: Array<{ id: string; code: string; name: string }>
    withholdingTaxCodes?: Array<{ id: string; code: string; name: string }>
}

export type ApDashboard = {
    companyId: string
    baseCurrency: string
    asOfDate: string
    fromDate: string | null
    toDate: string | null
    totalOutstanding: string
    totalOverdue: string
    dueWithin7Days: string
    dueWithin30Days: string
    paymentsInPeriodAmount: string
    paymentsInPeriodCount: number
    blockedInvoices: number
    blockedOpenItems: number
    supplierAdvanceBalance: string
    postingExceptions: number
    agingBuckets: {
        current: string
        days1To30: string
        days31To60: string
        days61To90: string
        over90: string
        supplierCredits: string
    }
    totalPayable: string
}

export type ApAgingReport = {
    asOfDate: string
    buckets: {
        current: string | number
        days1To30: string | number
        days31To60: string | number
        days61To90: string | number
        over90: string | number
        supplierCredits: string | number
    }
    totalPayable: string | number
    items: Array<
        ApOpenItemRow & { overdueDays: number; signedOpenAmount: string | number }
    >
}

export type ApReconciliationReport = {
    companyId: string
    accounts: Array<{
        id: string
        accountCode: string
        accountName: string
        generalLedgerBalance: string | number
        subledgerBalance: string | number
        difference: string | number
    }>
    difference: string | number
    reconciled: boolean
}

export type ApPaymentProposal = {
    supplierId: string
    supplier: ApSupplierRef
    currencyCode: string
    totalOpenAmount: string
    overdueAmount: string
    itemCount: number
    earliestDueDate: string | null
    items: Array<{
        id: string
        openAmount: string
        dueDate: string | null
        itemType: string
        document?: {
            id: string
            referenceNumber: string | null
            documentType: string
            journalEntryId: string | null
        } | null
    }>
}

export type ApSupplierStatement = {
    supplier: ApSupplierRef
    companyId: string
    summary: {
        openingBalance: string | number
        totalDebits: string | number
        totalCredits: string | number
        closingBalance: string | number
        openPayableBalance: string | number
        openCreditBalance: string | number
        netOpenBalance: string | number
    }
    entries: Array<{
        date: string
        documentType: string
        reference: string | null
        debitAmount: string | number
        creditAmount: string | number
        runningBalance: string | number
    }>
}

export type ApPaymentAllocationInput = {
    openItemId: string
    amount: number
}

export type CreateApPaymentInput = {
    companyId: string
    supplierId: string
    paymentDate: string
    currencyCode: string
    paymentMethodCode?: string
    bankAccountId?: string
    supplierBankApprovalId?: string
    paymentReference?: string
    idempotencyKey?: string
    allocations: ApPaymentAllocationInput[]
}

export type CreateApClearingInput = {
    companyId: string
    supplierId: string
    clearingDate: string
    currencyCode: string
    reference?: string
    idempotencyKey?: string
    allocations: ApClearingAllocationInput[]
}

export type ApClearingAllocationInput = {
    debitOpenItemId: string
    creditOpenItemId: string
    amount: number
}

export type CreateApAdjustmentInput = {
    companyId: string
    supplierId: string
    documentType: 'CREDIT_MEMO' | 'DEBIT_ADJUSTMENT' | 'ADVANCE'
    documentDate: string
    postingDate: string
    baselineDate?: string
    dueDate?: string
    currencyCode: string
    amount: number
    referenceNumber?: string
    reason?: string
    paymentBlocked?: boolean
    paymentMethodCode?: string
    bankAccountId?: string
    idempotencyKey?: string
}

export type CreateApDirectInvoiceInput = {
    companyId: string
    supplierId: string
    invoiceKind: 'EXPENSE_INVOICE' | 'NON_PO_INVOICE'
    supplierInvoiceNumber: string
    documentDate: string
    postingDate: string
    baselineDate?: string
    dueDate?: string
    currencyCode: string
    grossAmount: number
    taxAmount?: number
    taxCodeId?: string
    withholdingTaxCodeId?: string
    paymentBlocked?: boolean
    reason?: string
    idempotencyKey?: string
}