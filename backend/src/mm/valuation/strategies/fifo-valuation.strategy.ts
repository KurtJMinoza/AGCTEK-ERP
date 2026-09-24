import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { CostLayerService } from '../cost-layer.service'
import {
    ValuationMethodContext,
    ValuationMethodResult,
    ValuationMethodStrategy,
} from './valuation-method.interface'

const COST_SCALE = 6

function roundCost(v: Decimal): Decimal {
    return v.toDecimalPlaces(COST_SCALE)
}

@Injectable()
export class FifoValuationStrategy implements ValuationMethodStrategy {
    code = 'FIFO'

    constructor(private costLayers: CostLayerService) {}

    async applyInbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const receiptCost = roundCost(ctx.receiptUnitCost)
        await this.costLayers.createLayer(ctx.tx, {
            companyId: ctx.companyId,
            materialId: ctx.materialId,
            warehouseId: ctx.warehouseId,
            batchId: ctx.batchId,
            receiptTxnId: ctx.inventoryTxnId,
            receiptDocumentId: ctx.sourceDocumentId,
            quantity: ctx.quantity,
            unitCost: receiptCost,
            postingDate: ctx.postingDate,
        })
        return {
            unitCost: receiptCost,
            totalCost: roundCost(receiptCost.mul(ctx.quantity)),
            priceVariance: new Decimal(0),
            movingAvgBefore: null,
            movingAvgAfter: null,
            layerConsumptions: null,
        }
    }

    async applyOutbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const consumed = await this.costLayers.consumeFifo(ctx.tx, {
            companyId: ctx.companyId,
            materialId: ctx.materialId,
            warehouseId: ctx.warehouseId,
            batchId: ctx.batchId,
            quantity: ctx.quantity,
        })
        return {
            unitCost: roundCost(consumed.unitCost),
            totalCost: roundCost(consumed.totalCost),
            priceVariance: new Decimal(0),
            movingAvgBefore: null,
            movingAvgAfter: null,
            layerConsumptions: consumed.consumptions,
        }
    }
}
