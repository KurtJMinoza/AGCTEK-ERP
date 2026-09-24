import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    InboundListResponse,
    InboundQueryParams,
    MmInspectionLot,
    MmQualityHold,
    RecordInspectionResultsPayload,
    UsageDecisionPayload,
} from '../types'

const BASE = '/mm/quality'

export type QualityDashboard = {
    totalLots: number
    pendingLots: number
    inProgressLots: number
    pendingDecision: number
    activeHolds: number
    openNonconformances: number
    acceptanceRate: number
    rejectionRate: number
    returnRate: number
    topDefects: Array<{ code: string; count: number }>
}

export type MmInspectionPlan = {
    id: string
    planCode: string
    name: string
    companyId: string
    samplingType?: string
    status: string
    characteristics?: Array<{
        id: string
        lineNumber: number
        name: string
        valueType: string
        toleranceMin?: number
        toleranceMax?: number
        required?: boolean
    }>
}

export type MmInspectionRule = {
    id: string
    companyId: string
    ruleCode: string
    name: string
    priority: number
    active: boolean
    effectiveFrom?: string | null
    effectiveTo?: string | null
    materialId?: string | null
    materialCategoryId?: string | null
    supplierId?: string | null
    supplierCategoryId?: string | null
    plantId?: string | null
    warehouseId?: string | null
    purchaseType?: string | null
    receiptType?: string | null
    action: string
}

export type InspectionRulePayload = {
    companyId: string
    ruleCode: string
    name: string
    priority?: number
    active?: boolean
    effectiveFrom?: string
    effectiveTo?: string
    materialId?: string
    materialCategoryId?: string
    supplierId?: string
    supplierCategoryId?: string
    plantId?: string
    warehouseId?: string
    purchaseType?: string
    receiptType?: string
    action: string
}

export type MmDefectCode = {
    id: string
    code: string
    description: string
    category?: string
    severityDefault?: string
    active: boolean
}

export type MmNonconformance = {
    id: string
    ncNumber: string
    status: string
    severity?: string
    cause?: string
    affectedQuantity: number
    inspectionLot?: { id: string; lotNumber: string }
    correctiveActions?: MmCorrectiveAction[]
}

export type MmCorrectiveAction = {
    id: string
    actionNumber: string
    companyId: string
    nonconformanceId: string
    problem?: string | null
    rootCause?: string | null
    containment?: string | null
    correctiveAction?: string | null
    preventiveAction?: string | null
    owner?: string | null
    dueDate?: string | null
    status: string
    effectiveStatus: string
    resolution?: string | null
    completedAt?: string | null
    verifiedAt?: string | null
    verifiedBy?: string | null
    closedAt?: string | null
    closedBy?: string | null
    notes?: string | null
    createdAt: string
    updatedAt: string
    nonconformance?: {
        id: string
        ncNumber: string
        status: string
        severity?: string
        cause?: string
        affectedQuantity?: number
        inspectionLot?: {
            id: string
            lotNumber: string
            material?: { materialCode: string; materialName: string }
            supplier?: { supplierCode: string; supplierName: string }
        }
    }
}

export type CreateCapaPayload = {
    problem?: string
    rootCause?: string
    containment?: string
    correctiveAction?: string
    preventiveAction?: string
    owner?: string
    dueDate?: string
    notes?: string
}

export type UpdateCapaPayload = CreateCapaPayload & {
    resolution?: string
}

export type TransitionCapaPayload = {
    targetStatus: string
    resolution?: string
    verifiedBy?: string
    closedBy?: string
    notes?: string
}

export const qualityService = {
    dashboard: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<QualityDashboard>(`${BASE}/dashboard`, { params }).then((r) => r.data),

    listLots: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmInspectionLot>>(`${BASE}/inspection-lots`, {
            params,
        }).then((r) => r.data),

    getLot: (id: string) =>
        ErpAxiosBase.get<MmInspectionLot>(`${BASE}/inspection-lots/${id}`).then((r) => r.data),

    startLot: (id: string, data?: { inspector?: string }) =>
        ErpAxiosBase.post(`${BASE}/inspection-lots/${id}/start`, data ?? {}).then((r) => r.data),

    completeLot: (id: string, data?: { completedBy?: string; remarks?: string }) =>
        ErpAxiosBase.post(`${BASE}/inspection-lots/${id}/complete`, data ?? {}).then((r) => r.data),

    recordResults: (id: string, data: RecordInspectionResultsPayload) =>
        ErpAxiosBase.post<MmInspectionLot>(`${BASE}/inspection-lots/${id}/results`, data).then(
            (r) => r.data,
        ),

    usageDecision: (id: string, data: UsageDecisionPayload) =>
        ErpAxiosBase.post<{ lot: MmInspectionLot; decision: unknown }>(
            `${BASE}/inspection-lots/${id}/usage-decision`,
            data,
        ).then((r) => r.data),

    listHolds: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmQualityHold>>(`${BASE}/holds`, { params }).then(
            (r) => r.data,
        ),

    createHold: (data: {
        companyId: string
        reason: string
        inspectionLotId?: string
        holdType?: string
        heldBy?: string
    }) => ErpAxiosBase.post<MmQualityHold>(`${BASE}/holds`, data).then((r) => r.data),

    releaseHold: (id: string, data?: { releasedBy?: string; releaseNotes?: string }) =>
        ErpAxiosBase.post(`${BASE}/holds/${id}/release`, data ?? {}).then((r) => r.data),

    listPlans: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmInspectionPlan>>(`${BASE}/inspection-plans`, {
            params,
        }).then((r) => r.data),

    createPlan: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmInspectionPlan>(`${BASE}/inspection-plans`, data).then((r) => r.data),

    listRules: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmInspectionRule>>(`${BASE}/inspection-rules`, {
            params,
        }).then((r) => r.data),

    getRule: (id: string) =>
        ErpAxiosBase.get<MmInspectionRule>(`${BASE}/inspection-rules/${id}`).then((r) => r.data),

    createRule: (data: InspectionRulePayload) =>
        ErpAxiosBase.post<MmInspectionRule>(`${BASE}/inspection-rules`, data).then((r) => r.data),

    updateRule: (id: string, data: Partial<InspectionRulePayload>) =>
        ErpAxiosBase.put<MmInspectionRule>(`${BASE}/inspection-rules/${id}`, data).then(
            (r) => r.data,
        ),

    deleteRule: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/inspection-rules/${id}`).then((r) => r.data),

    seedLegacyRules: (companyId: string) =>
        ErpAxiosBase.post(`${BASE}/inspection-rules/seed-legacy/${companyId}`).then(
            (r) => r.data,
        ),

    listDefectCodes: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmDefectCode>>(`${BASE}/defect-codes`, { params }).then(
            (r) => r.data,
        ),

    createDefectCode: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmDefectCode>(`${BASE}/defect-codes`, data).then((r) => r.data),

    seedDefectCodes: (companyId: string) =>
        ErpAxiosBase.post(`${BASE}/defect-codes/seed/${companyId}`).then((r) => r.data),

    listNc: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmNonconformance>>(`${BASE}/nonconformances`, {
            params,
        }).then((r) => r.data),

    resolveNc: (id: string, data?: { resolvedBy?: string; notes?: string }) =>
        ErpAxiosBase.post(`${BASE}/nonconformances/${id}/resolve`, data ?? {}).then((r) => r.data),

    listDecisions: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<import('../types').MmQualityDecision>>(
            `${BASE}/usage-decisions`,
            { params },
        ).then((r) => r.data),

    // ── CAPA (Phase 1C) ──

    listCapaForNc: (ncId: string) =>
        ErpAxiosBase.get<MmCorrectiveAction[]>(
            `${BASE}/nonconformances/${ncId}/corrective-actions`,
        ).then((r) => r.data),

    listAllCapa: (params?: InboundQueryParams) =>
        ErpAxiosBase.get<InboundListResponse<MmCorrectiveAction>>(
            `${BASE}/corrective-actions`,
            { params },
        ).then((r) => r.data),

    getCapa: (id: string) =>
        ErpAxiosBase.get<MmCorrectiveAction>(`${BASE}/corrective-actions/${id}`).then(
            (r) => r.data,
        ),

    createCapa: (ncId: string, data: CreateCapaPayload) =>
        ErpAxiosBase.post<MmCorrectiveAction>(
            `${BASE}/nonconformances/${ncId}/corrective-actions`,
            data,
        ).then((r) => r.data),

    updateCapa: (id: string, data: UpdateCapaPayload) =>
        ErpAxiosBase.put<MmCorrectiveAction>(`${BASE}/corrective-actions/${id}`, data).then(
            (r) => r.data,
        ),

    transitionCapa: (id: string, data: TransitionCapaPayload) =>
        ErpAxiosBase.post<MmCorrectiveAction>(
            `${BASE}/corrective-actions/${id}/transition`,
            data,
        ).then((r) => r.data),
}
