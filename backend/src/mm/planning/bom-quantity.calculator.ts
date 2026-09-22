import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'

export type BomQuantityInput = {
    parentQuantity: Decimal
    quantityPer: Decimal
    bomYieldFactor?: Decimal
    componentScrapFactor?: Decimal
}

export interface BomQuantityCalculator {
    computeComponentQuantity(input: BomQuantityInput): Decimal
}

export function computeComponentQuantityPure(input: BomQuantityInput): Decimal {
    const yieldFactor =
        input.bomYieldFactor && input.bomYieldFactor.gt(0)
            ? input.bomYieldFactor
            : new Decimal(1)
    const scrapFactor = input.componentScrapFactor ?? new Decimal(0)
    return input.parentQuantity
        .div(yieldFactor)
        .mul(input.quantityPer)
        .mul(new Decimal(1).plus(scrapFactor))
}

@Injectable()
export class DefaultBomQuantityCalculator implements BomQuantityCalculator {
    computeComponentQuantity(input: BomQuantityInput): Decimal {
        return computeComponentQuantityPure(input)
    }
}

export const BOM_QUANTITY_CALCULATOR = Symbol('BOM_QUANTITY_CALCULATOR')
