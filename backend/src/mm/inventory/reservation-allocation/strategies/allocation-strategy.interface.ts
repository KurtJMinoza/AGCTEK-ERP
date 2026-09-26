import { Decimal } from '@prisma/client/runtime/library'

export type AllocationCandidate = {
    storageBinId: string
    batchId: string | null
    serialNumberId: string | null
    availableQuantity: Decimal
    binCode?: string
    batchExpiry?: Date | null
    priority?: number
}

export type AllocationStrategyContext = {
    companyId: string
    warehouseId: string
    materialId: string
    quantity: Decimal
    batchId?: string | null
    serialNumberId?: string | null
    stockStatus?: string
    customLines?: Array<{
        storageBinId: string
        quantity: number
        batchId?: string
        serialNumberId?: string
    }>
}

export interface AllocationStrategy {
    code: string
    plan(ctx: AllocationStrategyContext, candidates: AllocationCandidate[]): AllocationCandidate[]
}
