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
export class MovingAverageValuationStrategy implements ValuationMethodStrategy {
    code = 'MOVING_AVERAGE'

    async applyInbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const receiptCost = roundCost(ctx.receiptUnitCost)
        const qty = ctx.quantity
        const movingAvgBefore = new Decimal(ctx.valuation.movingAverageCost as any)
        // onHand already includes this receipt (balance updated before valuation)
        const qtyBefore = ctx.onHandQty.minus(qty)
        let movingAvgAfter: Decimal
        if (qtyBefore.lte(0)) {
            movingAvgAfter = receiptCost
        } else {
            movingAvgAfter = qtyBefore
                .mul(movingAvgBefore)
                .plus(qty.mul(receiptCost))
                .div(qtyBefore.plus(qty))
        }
        movingAvgAfter = roundCost(movingAvgAfter)
        await ctx.tx.mmMaterialValuation.update({
            where: { id: ctx.valuation.id },
            data: { movingAverageCost: movingAvgAfter },
        })
        return {
            unitCost: receiptCost,
            totalCost: roundCost(receiptCost.mul(qty)),
            priceVariance: new Decimal(0),
            movingAvgBefore,
            movingAvgAfter,
            layerConsumptions: null,
        }
    }

    async applyOutbound(ctx: ValuationMethodContext): Promise<ValuationMethodResult> {
        const movingAvgBefore = new Decimal(ctx.valuation.movingAverageCost as any)
        const unitCost = roundCost(movingAvgBefore)
        return {
            unitCost,
            totalCost: roundCost(unitCost.mul(ctx.quantity)),
            priceVariance: new Decimal(0),
            movingAvgBefore,
            movingAvgAfter: movingAvgBefore,
            layerConsumptions: null,
        }
    }
}
