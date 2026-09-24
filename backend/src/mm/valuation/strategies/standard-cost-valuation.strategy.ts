import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
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
export class StandardCostValuationStrategy implements ValuationMethodStrategy {
    code = 'STANDARD_COST'

    async applyInbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const receiptCost = roundCost(ctx.receiptUnitCost)
        const unitCost = roundCost(new Decimal(ctx.valuation.standardCost as any))
        const totalCost = roundCost(unitCost.mul(ctx.quantity))
        const priceVariance = roundCost(receiptCost.minus(unitCost).mul(ctx.quantity))
        return {
            unitCost,
            totalCost,
            priceVariance,
            movingAvgBefore: null,
            movingAvgAfter: null,
            layerConsumptions: null,
        }
    }

    async applyOutbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const unitCost = roundCost(new Decimal(ctx.valuation.standardCost as any))
        return {
            unitCost,
            totalCost: roundCost(unitCost.mul(ctx.quantity)),
            priceVariance: new Decimal(0),
            movingAvgBefore: null,
            movingAvgAfter: null,
            layerConsumptions: null,
        }
    }
}
