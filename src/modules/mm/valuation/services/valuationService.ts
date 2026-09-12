import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MaterialValuation,
    CostLayer,
    ValuationTransaction,
    InventoryValueRow,
    LandedCost,
    ListMeta,
} from '../types'

const BASE = '/mm/valuation'

export type PriceVarianceRow = {
    id: string
    varianceNumber: string
    varianceType: string
    materialId: string
    warehouseId: string
    poPrice?: number | string | null
    standardCost?: number | string | null
    invoicePrice?: number | string | null
    landedUnitCost?: number | string | null
    actualUnitCost?: number | string | null
    varianceAmount: number | string
    status: string
    createdAt: string
    material?: { materialCode?: string; materialName?: string }
    warehouse?: { code?: string; name?: string }
}

export type CostElement = {
    id: string
    companyId: string
    code: string
    name: string
    costType: string
    isActive: boolean
}

export const valuationService = {
    listMaterialValuations: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MaterialValuation[]; meta: ListMeta }>(
            `${BASE}/material-valuations`,
            { params },
        ).then((r) => r.data),

    /** Canonical profile alias */
    listProfiles: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MaterialValuation[]; meta: ListMeta }>(
            `${BASE}/profiles`,
            { params },
        ).then((r) => r.data),

    upsertProfile: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MaterialValuation>(`${BASE}/profiles`, data).then(
            (r) => r.data,
        ),

    upsertMaterialValuation: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MaterialValuation>(
            `${BASE}/material-valuations`,
            data,
        ).then((r) => r.data),

    updateMaterialValuation: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<MaterialValuation>(
            `${BASE}/material-valuations/${id}`,
            data,
        ).then((r) => r.data),

    reviseStandard: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<MaterialValuation>(
            `${BASE}/material-valuations/${id}/revise-standard`,
            data,
        ).then((r) => r.data),

    listCostLayers: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: CostLayer[]; meta: ListMeta }>(
            `${BASE}/cost-layers`,
            { params },
        ).then((r) => r.data),

    createCostLayer: (data: { receiptTxnId: string }) =>
        ErpAxiosBase.post<CostLayer>(`${BASE}/cost-layers`, data).then(
            (r) => r.data,
        ),

    listValuationTransactions: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ValuationTransaction[]; meta: ListMeta }>(
            `${BASE}/valuation-transactions`,
            { params },
        ).then((r) => r.data),

    getInventoryValue: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: InventoryValueRow[]; meta: ListMeta }>(
            `${BASE}/inventory`,
            { params },
        ).then((r) => r.data),

    listPriceVariance: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: PriceVarianceRow[]; meta: ListMeta }>(
            `${BASE}/price-variance`,
            { params },
        ).then((r) => r.data),

    listCostElements: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: CostElement[]; meta: ListMeta }>(
            `${BASE}/cost-elements`,
            { params },
        ).then((r) => r.data),

    upsertCostElement: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<CostElement>(`${BASE}/cost-elements`, data).then(
            (r) => r.data,
        ),

    ensureCostElementDefaults: (companyId: string) =>
        ErpAxiosBase.post(`${BASE}/cost-elements/ensure-defaults`, {
            companyId,
        }).then((r) => r.data),

    listLandedCosts: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: LandedCost[]; meta: ListMeta }>(
            `${BASE}/landed-costs`,
            { params },
        ).then((r) => r.data),

    getLandedCost: (id: string) =>
        ErpAxiosBase.get<LandedCost>(`${BASE}/landed-costs/${id}`).then(
            (r) => r.data,
        ),

    createLandedCost: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<LandedCost>(`${BASE}/landed-cost`, data).then(
            (r) => r.data,
        ),

    allocatePreview: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<LandedCost>(
            `${BASE}/landed-costs/${id}/allocate-preview`,
            data ?? {},
        ).then((r) => r.data),

    capitalizeLandedCost: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<LandedCost>(
            `${BASE}/landed-costs/${id}/capitalize`,
            data ?? {},
        ).then((r) => r.data),

    /** Canonical allocate = capitalize */
    allocateLandedCost: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<LandedCost>(
            `${BASE}/landed-cost/${id}/allocate`,
            data ?? {},
        ).then((r) => r.data),
}
