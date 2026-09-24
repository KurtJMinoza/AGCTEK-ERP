import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { LayerConsumption } from '../cost-layer.service'

export type ValuationMethodContext = {
    tx: Prisma.TransactionClient
    companyId: string
    materialId: string
    warehouseId: string
    batchId?: string | null
    inventoryTxnId: string
    sourceDocumentId?: string | null
    quantity: Decimal
    receiptUnitCost: Decimal
    postingDate: Date
    valuation: {
        id: string
        standardCost: Decimal | unknown
        movingAverageCost: Decimal | unknown
    }
    onHandQty: Decimal
}

export type ValuationMethodResult = {
    unitCost: Decimal
    totalCost: Decimal
    priceVariance: Decimal
    movingAvgBefore: Decimal | null
    movingAvgAfter: Decimal | null
    layerConsumptions: LayerConsumption[] | null
}

export interface ValuationMethodStrategy {
    code: string
    applyInbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult>
    applyOutbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult>
}
