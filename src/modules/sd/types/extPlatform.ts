// Types for External Platform Sales feature

export type SalesSource = {
    id: string
    code: string
    name: string
    description: string | null
    badgeColor: string | null
    origin: string
    isActive: boolean
    sortOrder: number
}

export type ExtPlatformTransactionLine = {
    id: string
    lineNumber: number
    /** Sold SD Product Catalog item; null on lines recorded before catalog linking. */
    productId: string | null
    variantId: string | null
    productName: string | null
    variantName: string | null
    /** MM material resolved from the catalog item; owns the tax setup. */
    materialId: string
    materialCode: string | null
    materialName: string | null
    sku: string | null
    description: string | null
    quantity: number
    uomId: string | null
    uom: { id: string; code: string; name: string } | null
    unitPrice: number
    discount: number
    lineSubtotal: number
    taxClassification: string | null
    taxCodeId: string | null
    taxCode: string | null
    taxRate: number | null
    calculationMethod: string | null
    taxableAmount: number
    taxAmount: number
    exemptAmount: number
    zeroRatedAmount: number
    netAmount: number
    grossAmount: number
}

export type ExtPlatformTransaction = {
    id: string
    transactionNumber: string
    salesSourceId: string
    salesSource: SalesSource
    externalPlatformName: string | null
    externalOrderRef: string | null
    transactionDate: string
    companyId: string
    company: { id: string; code: string; name: string }
    branchId: string | null
    branch: { id: string; code: string; name: string } | null
    customerId: string | null
    customer: {
        id: string
        companyName: string
        customerNumber: string | null
    } | null
    customerName: string | null
    currency: string
    status: string
    subtotal: number
    discountTotal: number
    taxTotal: number
    grandTotal: number
    paymentMethod: string | null
    settlementReference: string | null
    platformFees: number
    remarks: string | null
    isCompanyInventory: boolean
    createdBy: string | null
    approvedBy: string | null
    approvedAt: string | null
    createdAt: string
    updatedAt: string
    lines: ExtPlatformTransactionLine[]
}

export type ExtPlatformTransactionListResult = {
    data: ExtPlatformTransaction[]
    total: number
    limit: number
    offset: number
}

export type ExtPlatformReportSummary = {
    totalTransactions: number
    totalSales: number
    totalSubtotal: number
    totalDiscount: number
    totalTax: number
    totalPlatformFees: number
    netSettlement: number
    bySource: Array<{
        salesSourceId: string
        salesSourceCode: string
        salesSourceName: string
        transactions: number
        totalSales: number
        totalTax: number
        totalDiscount: number
        platformFees: number
    }>
    taxBreakdown: Array<{
        taxClassification: string
        taxableAmount: number
        taxAmount: number
        exemptAmount: number
        zeroRatedAmount: number
    }>
}

/** A sold SD Product Catalog item; the backend resolves its MM material. */
export type CreateExtPlatformTransactionLineInput = {
    productId: string
    variantId?: string
    quantity: number
    uomId?: string
    unitPrice: number
    discount?: number
    description?: string
}

/** Live MM availability of one catalog item (same ATP the POS uses). */
export type ExtPlatformStock = {
    productId: string
    variantId: string | null
    availableQuantity: number
    /** IN_STOCK | LOW_STOCK | OUT_OF_STOCK | NOT_MAPPED | NON_INVENTORY */
    state: string
}

export type ExtPlatformTaxPreviewLine =
    | {
          lineNumber: number
          /** The catalog item could not be linked to an MM material. */
          error: string
      }
    | {
          lineNumber: number
          error?: undefined
          materialId: string
          materialCode: string
          taxClassification: string | null
          taxCode: string | null
          taxRate: number
          calculationMethod: string | null
          lineSubtotal: number
          taxableAmount: number
          taxAmount: number
          exemptAmount: number
          zeroRatedAmount: number
          netAmount: number
          grossAmount: number
      }

export type ExtPlatformTaxPreview = {
    lines: ExtPlatformTaxPreviewLine[]
    totals: {
        grossSales: number
        discount: number
        taxableSales: number
        vatAmount: number
        exemptSales: number
        zeroRatedSales: number
        nonTaxableSales: number
        netAmount: number
        grandTotal: number
        platformFees: number
        netSettlement: number
    }
}

export type UpdateExtPlatformTransactionInput = Partial<
    Omit<CreateExtPlatformTransactionInput, 'companyId' | 'branchId' | 'customerId'>
> & {
    /** null clears the value. */
    branchId?: string | null
    customerId?: string | null
}

export type CreateExtPlatformTransactionInput = {
    salesSourceId: string
    externalPlatformName?: string
    externalOrderRef?: string
    transactionDate: string
    companyId: string
    branchId?: string
    customerId?: string
    customerName?: string
    currency?: string
    paymentMethod?: string
    settlementReference?: string
    platformFees?: number
    remarks?: string
    isCompanyInventory?: boolean
    lines: CreateExtPlatformTransactionLineInput[]
}
