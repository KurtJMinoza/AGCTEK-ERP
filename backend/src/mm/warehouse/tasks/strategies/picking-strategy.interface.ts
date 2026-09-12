export type PickingStrategyContext = {
    companyId: string
    warehouseId: string
    materialId: string
    requiredQty: number
    batchId?: string | null
    serialId?: string | null
    zoneCode?: string | null
}

export type PickingStrategyCode = 'FIFO' | 'FEFO' | 'FIXED_BIN' | 'NEAREST_BIN'

export interface PickingStrategy {
    code: PickingStrategyCode
    suggestSourceBin(ctx: PickingStrategyContext): Promise<{
        storageBinId: string
        batchId?: string
        serialNumberId?: string
    } | null>
}
