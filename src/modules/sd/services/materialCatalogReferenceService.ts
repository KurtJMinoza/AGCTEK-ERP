import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'

export type MaterialCatalogReference = {
    materialId: string
    materialCode: string
    materialName: string
    companyId: string
    /** Quantities are normalized to this sales UOM. */
    salesUom: string | null
    baseUom: string | null
    onHand: number
    available: number
    reserved: number
    maxStock: number
    safetyStock: number
    standardCost: number
    warehouseBreakdown: MaterialCatalogWarehouseStock[]
    general: {
        materialCode: string
        materialName: string
        sku: string | null
        brand: string | null
        model: string | null
        manufacturer: string | null
        shortDescription: string | null
        description: string | null
        status: string
        materialType: string | null
        materialCategory: string | null
    }
    uom: {
        baseUomId: string
        baseUomCode: string | null
        baseUomName: string | null
        salesUomId: string | null
        salesUomCode: string | null
        salesUomName: string | null
        purchaseUomCode: string | null
        purchaseUomName: string | null
    }
    physical: {
        weight: number | null
        weightUom: string | null
        length: number | null
        width: number | null
        height: number | null
        dimensionUom: string | null
        volume: number | null
        volumeUom: string | null
    }
    tracking: {
        inventoryManaged: boolean
        batchManaged: boolean
        serialManaged: boolean
        expiryManaged: boolean
        sellable: boolean
        purchasable: boolean
        qualityInspectionRequired: boolean
    }
    expiry: {
        defaultShelfLifeDays: number | null
        earliestExpiryDate: string | null
        nearestBatchNumber: string | null
    }
    inventory: {
        minimumStock: number
        maximumStock: number
        safetyStock: number
        reorderPoint: number
        onHandQty: number
        availableQty: number
        reservedQty: number
        stockAvailable: number
        stockAvailableState: string
        quantityUomCode: string | null
        stockScope:
            | 'WAREHOUSE'
            | 'DEFAULT_WAREHOUSE'
            | 'COMPANY_ACTIVE_WAREHOUSES'
        warehouseId: string | null
        warehouseBreakdown: MaterialCatalogWarehouseStock[]
        fulfillmentAtpQty?: number
        fulfillmentWarehouseCode: string | null
    }
    valuation: {
        valuationMethod: string | null
        standardCost: number
        currencyCode: string
        valuationClass: string | null
    }
}

export type MaterialCatalogWarehouseStock = {
    warehouseId: string
    warehouseCode: string
    warehouseName: string
    plantId: string | null
    onHand: number
    available: number
    reserved: number
    maxStock: number
    safetyStock: number
    thresholdSource:
        | 'WAREHOUSE'
        | 'COMPANY'
        | 'MATERIAL'
        | 'AGGREGATE_WAREHOUSES'
}

export type MaterialCatalogStockScope = {
    warehouseId?: string
    plantId?: string
}

export type MaterialCatalogReferenceBatch = {
    materials: MaterialCatalogReference[]
    /** Materials MM could not resolve (not found, other company, bad UOM …). */
    failures: Array<{ materialId: string; error: string }>
    totals: {
        availableQty: number
        onHandQty: number
        reservedQty: number
        maximumStock: number
        safetyStock: number
        stockAvailable: number
    }
    companyId: string
    divisionId: string | null
    warehouseId?: string | null
    plantId?: string | null
}

export async function fetchMaterialCatalogReferenceBatch(
    materialIds: string[],
    companyId: string,
    divisionId?: string,
    cacheBust?: number,
    scope: MaterialCatalogStockScope = {},
): Promise<MaterialCatalogReferenceBatch> {
    if (!materialIds.length) {
        return {
            materials: [],
            failures: [],
            totals: {
                availableQty: 0,
                onHandQty: 0,
                reservedQty: 0,
                maximumStock: 0,
                safetyStock: 0,
                stockAvailable: 0,
            },
            companyId,
            divisionId: divisionId ?? null,
        }
    }
    try {
        const { data } = await ErpAxiosBase.get<MaterialCatalogReferenceBatch>(
            '/sd/material-catalog-reference/batch/preview',
            {
                params: {
                    companyId,
                    divisionId: divisionId || undefined,
                    materialIds: materialIds.join(','),
                    warehouseId: scope.warehouseId || undefined,
                    plantId: scope.plantId || undefined,
                    ...(cacheBust ? { _t: cacheBust } : {}),
                },
            },
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to load material inventory')
    }
}

export async function fetchMaterialCatalogReference(
    materialId: string,
    companyId: string,
    divisionId?: string,
    scope: MaterialCatalogStockScope = {},
): Promise<MaterialCatalogReference> {
    try {
        const { data } = await ErpAxiosBase.get<MaterialCatalogReference>(
            `/sd/material-catalog-reference/${encodeURIComponent(materialId)}`,
            {
                params: {
                    companyId,
                    divisionId: divisionId || undefined,
                    warehouseId: scope.warehouseId || undefined,
                    plantId: scope.plantId || undefined,
                },
            },
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to load material reference')
    }
}
