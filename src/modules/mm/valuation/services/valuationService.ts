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

export const valuationService = {
    listMaterialValuations: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MaterialValuation[]; meta: ListMeta }>(
            `${BASE}/material-valuations`,
            { params },
        ).then((r) => r.data),

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

    listValuationTransactions: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ValuationTransaction[]; meta: ListMeta }>(
            `${BASE}/valuation-transactions`,
            { params },
        ).then((r) => r.data),

    getInventoryValue: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: InventoryValueRow[]; meta: ListMeta }>(
            `${BASE}/inventory-value`,
            { params },
        ).then((r) => r.data),

    listLandedCosts: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: LandedCost[]; meta: ListMeta }>(
            `${BASE}/landed-costs`,
            { params },
        ).then((r) => r.data),

    createLandedCost: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<LandedCost>(`${BASE}/landed-costs`, data).then(
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
}
