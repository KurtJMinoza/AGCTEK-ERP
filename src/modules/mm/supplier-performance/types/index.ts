export type ListMeta = {
    total: number
    page: number
    limit: number
    totalPages: number
}

export type ScoreWeightConfig = {
    id?: string | null
    companyId: string
    deliveryWeight: number
    qualityWeight: number
    priceWeight: number
    serviceWeight: number
    complianceWeight: number
}

export type AlertConfig = {
    id?: string | null
    companyId: string
    scoreThreshold: number | string
    isActive: boolean
}

export type SupplierEvaluation = {
    id: string
    companyId: string
    supplierId: string
    periodStart: string
    periodEnd: string
    onTimePct: number | string
    qualityAcceptanceRate: number | string
    returnRate: number | string
    leadTimeAccuracyPct: number | string
    priceVariancePct: number | string
    avgResponseHours: number | string
    complianceRate: number | string
    purchaseVolume: number | string
    deliveryScore: number | string
    qualityScore: number | string
    priceScore: number | string
    serviceScore: number | string
    complianceScore: number | string
    overallScore: number | string
    sampleSizes?: Record<string, number> | null
    computedAt: string
    supplier?: {
        id: string
        supplierCode: string
        supplierName: string
        status: string
    }
}

export type SupplierPerfAlert = {
    id: string
    companyId: string
    supplierId: string
    evaluationId: string
    score: number | string
    threshold: number | string
    status: string
    message?: string | null
    createdAt: string
    supplier?: {
        id: string
        supplierCode: string
        supplierName: string
        status: string
    }
    evaluation?: {
        id: string
        periodStart: string
        periodEnd: string
        overallScore: number | string
    }
}

export type PerformanceDashboard = {
    period: { periodStart: string; periodEnd: string } | null
    summary: {
        suppliersEvaluated: number
        avgOverallScore: number
        avgDelivery: number
        avgQuality: number
        avgReturnRate: number
        avgPriceScore: number
        totalPurchaseVolume: number
        openAlerts: number
    }
    rankings: SupplierEvaluation[]
    trend: Array<{
        periodStart: string
        periodEnd: string
        overallScore: number
        deliveryScore: number
        qualityScore: number
        priceScore: number
        purchaseVolume: number
    }>
}

export type ManualAssessment = {
    id: string
    companyId: string
    supplierId: string
    assessmentDate: string
    overallScore: number | string
    deliveryScore?: number | string | null
    qualityScore?: number | string | null
    priceScore?: number | string | null
    serviceScore?: number | string | null
    complianceScore?: number | string | null
    notes?: string | null
    assessedBy: string
    status: string
}

export type SupplierPerformanceDetail = {
    supplier: {
        id: string
        supplierCode: string
        supplierName: string
        status: string
        leadTimeDays?: number | null
    }
    score: SupplierEvaluation | null
    trend: PerformanceDashboard['trend']
    purchaseOrders: Array<{
        id: string
        poNumber: string
        status: string
        expectedDeliveryDate?: string | null
        totalAmount: number | string
        createdAt: string
    }>
    goodsReceipts: Array<{
        id: string
        documentNumber: string
        status: string
        postingDate: string
        promisedDate?: string | null
        actualReceiptDate: string
        purchaseOrder?: { poNumber: string; expectedDeliveryDate?: string | null } | null
    }>
    qualityHistory: Array<{
        id: string
        documentNumber: string
        status: string
        result?: string | null
        receivedQuantity: number
        acceptedQuantity: number
        acceptanceRate: number | null
        createdAt: string
    }>
    returns: Array<{
        id: string
        returnNumber: string
        status: string
        reason: string
        totalQuantity: number | string
        estimatedValue: number | string
        createdAt: string
    }>
    pricing: {
        catalog: Array<{
            id: string
            unitPrice: number | string
            material?: { materialCode: string; materialName: string } | null
        }>
        invoicePriceVariance: Array<{
            invoiceNumber: string
            invoiceDate: string
            poUnitPrice: number | null
            invoiceUnitPrice: number
            priceVariancePct: number | null
            materialCode?: string | null
        }>
    }
    manualAssessments: ManualAssessment[]
    note?: string
}
