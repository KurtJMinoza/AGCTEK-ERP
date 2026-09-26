export type PutawayStrategyContext = {
    warehouseId: string
    materialId: string
    quantity: number
    batchId?: string
    serialId?: string
    stockStatus?: string
}

export type PutawayStrategyCode =
    | 'FIXED_BIN'
    | 'CAPACITY_BASED'
    | 'NEAREST_BIN'
    | 'MATERIAL_ZONE'
    | 'TEMPERATURE_ZONE'
    | 'FIFO_ZONE'
    | 'FEFO_ZONE'

export interface PutawayStrategy {
    code: PutawayStrategyCode
    recommend(ctx: PutawayStrategyContext): Promise<string | null>
}
