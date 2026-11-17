import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { Prisma } from '@prisma/client'

const TWO_PLACES = 2

type ConditionRow = {
    id: string
    conditionCode: string
    conditionType: string
    name: string
    productId: string | null
    minQuantity: Decimal | null
    customerType: string
    valueType: string
    value: Decimal
    promoCode: string | null
    validFrom: Date
    validTo: Date | null
    product: {
        id: string
        sku: string
        name: string
    } | null
}

@Injectable()
export class PricingResolutionService {
    private readonly logger = new Logger(PricingResolutionService.name)

    constructor(private prisma: PrismaService) {}

    /** Resolve the final unit price for an order line applying active pricing conditions. */
    async resolveUnitPrice(input: {
        productId: string
        sku: string
        variantId?: string | null
        quantity: number
        customerType: 'RETAIL' | 'B2B' | 'ALL'
        promoCode?: string | null
    }): Promise<{
        baseUnitPrice: number
        unitPrice: number
        discountPerUnit: number
        appliedConditionId: string | null
        appliedConditionCode: string | null
        appliedValueType: 'PERCENT_OFF' | 'FIXED_PRICE' | null
        appliedValue: number | null
    }> {
        const now = new Date()

        // ---------- 1. Load product for base price ----------
        const product = await this.prisma.sdProduct.findUnique({
            where: { id: input.productId },
            select: {
                id: true,
                sku: true,
                price: true,
                isActive: true,
            },
        })

        if (!product || !product.isActive) {
            throw new Error(`Product ${input.productId} not found or inactive`)
        }

        // Base price: variant.price ?? product.price
        // We'll use product.price as base; variant handling can be added later
        const baseUnitPrice: number = Number(product.price)

        // ---------- 2. Query active pricing conditions ----------
        const activeWhere: Prisma.SdPricingConditionWhereInput = {
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
            conditionType: {
                in: ['PROMO', 'TIER_DISCOUNT'],
            },
            customerType: {
                in: [input.customerType, 'ALL'],
            },
            ...(input.productId ? { productId: input.productId } : {}),
        }

        const rawConditions = await this.prisma.sdPricingCondition.findMany({
            where: activeWhere,
            include: { product: { select: { id: true, sku: true, name: true } } },
            orderBy: [{ validFrom: 'desc' }, { conditionCode: 'asc' }],
        })

        // Map to typed rows
        const conditions: ConditionRow[] = rawConditions.map((c) => ({
            id: c.id,
            conditionCode: c.conditionCode,
            conditionType: c.conditionType,
            name: c.name,
            productId: c.productId,
            minQuantity: c.minQuantity,
            customerType: c.customerType,
            valueType: c.valueType,
            value: c.value,
            promoCode: c.promoCode,
            validFrom: c.validFrom,
            validTo: c.validTo,
            product: c.product ?? null,
        }))

        // ---------- 3. Filter conditions further (promoCode, minQuantity) ----------
        const filtered = conditions.filter((cond) => {
            // minQuantity check
            if (cond.minQuantity) {
                const minQty = Number(cond.minQuantity)
                if (input.quantity < minQty) {
                    return false
                }
            }

            // promoCode check
            if (cond.promoCode) {
                if (input.promoCode) {
                    // Codes must match
                    if (cond.promoCode.toUpperCase() !== input.promoCode?.toUpperCase()) {
                        return false
                    }
                } else {
                    // Has promoCode but request supplies no code → do not auto-apply
                    return false
                }
            }
            // If condition has no promoCode → may auto-apply when other filters match

            return true
        })

        // ---------- 4. Pick best condition per precedence ----------
        // Precedence: 1. PROMO with matching promoCode, 2. best auto PROMO, 3. best TIER_DISCOUNT, 4. base
        const promoMatching = filtered.find(
            (c) => c.conditionType === 'PROMO' && c.promoCode !== null,
        )

        let bestAutoPromo: ConditionRow | null = null
        let bestTierDiscount: ConditionRow | null = null

        if (!promoMatching) {
            const autoPromos = filtered.filter(
                (c) => c.conditionType === 'PROMO' && c.promoCode === null,
            )
            const tierDiscounts = filtered.filter(
                (c) => c.conditionType === 'TIER_DISCOUNT',
            )

            if (autoPromos.length > 0) {
                bestAutoPromo = this.pickBestAutoPromo(autoPromos, baseUnitPrice, input.quantity)
            }
            if (tierDiscounts.length > 0) {
                bestTierDiscount = this.pickBestTierDiscount(tierDiscounts, baseUnitPrice, input.quantity)
            }
        }

        // Determine applied condition following precedence
        let appliedCondition: ConditionRow | null = null

        if (promoMatching) {
            appliedCondition = promoMatching
        } else if (bestAutoPromo) {
            appliedCondition = bestAutoPromo
        } else if (bestTierDiscount) {
            appliedCondition = bestTierDiscount
        } else {
            appliedCondition = null // use base
        }

        // ---------- 5. Apply value and compute final price ----------
        let unitPrice: number = this.roundToTwo(baseUnitPrice) // default to base
        let appliedValueType: 'PERCENT_OFF' | 'FIXED_PRICE' | null = null
        let appliedValue: number | null = null
        let discountPerUnit = 0

        if (!appliedCondition) {
            // Use base - unitPrice already set above
            appliedValueType = null
            appliedValue = null
            discountPerUnit = 0
        } else {
            const valueType = appliedCondition.valueType
            const value = Number(appliedCondition.value)

            if (valueType === 'PERCENT_OFF') {
                // PERCENT_OFF → unit = round(base * (1 - value/100), 2)
                const pctValue = Math.min(Math.max(value, 0.01), 100)
                const computed = baseUnitPrice * (1 - pctValue / 100)
                unitPrice = this.roundToTwo(computed)
                appliedValueType = 'PERCENT_OFF'
                appliedValue = pctValue
                discountPerUnit = this.roundToTwo(baseUnitPrice - unitPrice)
            } else if (valueType === 'FIXED_PRICE') {
                // FIXED_PRICE → unit = round(value, 2)
                if (value > baseUnitPrice) {
                    this.logger.log(
                        `FIXED_PRICE condition ${appliedCondition.id} > base price ${baseUnitPrice}, skipping condition`,
                    )
                    // Skip condition, fall through to base (unitPrice already set to base)
                    appliedValueType = null
                    appliedValue = null
                    discountPerUnit = 0
                } else {
                    unitPrice = this.roundToTwo(value)
                    appliedValueType = 'FIXED_PRICE'
                    appliedValue = value
                    discountPerUnit = this.roundToTwo(baseUnitPrice - unitPrice)
                }
            } else {
                // Unknown valueType, fall back to base
                appliedValueType = null
                appliedValue = null
                discountPerUnit = 0
            }
        }

        // Ensure unitPrice never exceeds base (safety net)
        if (unitPrice > baseUnitPrice) {
            unitPrice = this.roundToTwo(baseUnitPrice)
            discountPerUnit = this.roundToTwo(baseUnitPrice - unitPrice)
            // Clear applied condition if we had to cap
            if (appliedValueType) {
                this.logger.log(
                    `Capped unitPrice to base for condition ${appliedCondition?.id}, falling back to base`,
                )
                appliedValueType = null
                appliedValue = null
                discountPerUnit = 0
            }
        }

        const discountPerUnitVal = appliedValueType && discountPerUnit
            ? discountPerUnit
            : 0

        return {
            baseUnitPrice,
            unitPrice,
            discountPerUnit: discountPerUnitVal,
            appliedConditionId: appliedCondition?.id ?? null,
            appliedConditionCode: appliedCondition?.conditionCode ?? null,
            appliedValueType,
            appliedValue,
        }
    }

    /** Pick the best auto PROMO (no code required) for this product/customer/qty/date. */
    private pickBestAutoPromo(
        promos: ConditionRow[],
        basePrice: number,
        quantity: number,
    ): ConditionRow | null {
        const scored = promos.map((cond) => {
            const value = Number(cond.value)
            const unit = this.roundToTwo(basePrice * (1 - value / 100))
            const discount = this.roundToTwo(basePrice - unit)
            return {
                ...cond,
                unitPrice: unit,
                discountPerUnit: discount,
            }
        })

        // Sort: lowest unit price first, then highest percent off, then newer validFrom
        scored.sort((a, b) => {
            if (a.unitPrice !== b.unitPrice) {
                return a.unitPrice - b.unitPrice // lowest first
            }
            if (a.value !== b.value) {
                return Number(b.value) - Number(a.value) // highest percent off first
            }
            return (
                Number(b.validFrom?.getTime() ?? 0) -
                Number(a.validFrom?.getTime() ?? 0)
            ) // newer first
        })

        return scored[0] || null
    }

    /** Pick the best TIER_DISCOUNT for the given quantity. */
    private pickBestTierDiscount(
        tiers: ConditionRow[],
        basePrice: number,
        quantity: number,
    ): ConditionRow | null {
        // Filter: minQuantity already checked in resolver, but re-verify
        const applicable = tiers.filter((cond) => {
            if (cond.minQuantity === null || cond.minQuantity === undefined) return true
            const minQty = Number(cond.minQuantity)
            return quantity >= minQty
        })

        if (applicable.length === 0) return null

        const scored = applicable.map((cond) => {
            const value = Number(cond.value)
            let unitPrice: number, discount: number

            if (cond.valueType === 'PERCENT_OFF') {
                unitPrice = this.roundToTwo(basePrice * (1 - value / 100))
                discount = this.roundToTwo(basePrice - unitPrice)
            } else if (cond.valueType === 'FIXED_PRICE') {
                unitPrice = this.roundToTwo(value)
                discount = this.roundToTwo(basePrice - unitPrice)
            } else {
                unitPrice = basePrice
                discount = 0
            }

            return {
                ...cond,
                unitPrice,
                discountPerUnit: discount,
            }
        })

        // Sort: lowest unit price first, then highest percent off, then newer validFrom
        scored.sort((a, b) => {
            if (a.unitPrice !== b.unitPrice) {
                return a.unitPrice - b.unitPrice // lowest first
            }
            if (a.value !== b.value) {
                return Number(b.value) - Number(a.value) // highest percent off first
            }
            return (
                Number(b.validFrom?.getTime() ?? 0) -
                Number(a.validFrom?.getTime() ?? 0)
            ) // newer first
        })

        return scored[0]
    }

    private roundToTwo(num: number): number {
        return Math.round(num * Math.pow(10, TWO_PLACES)) / Math.pow(10, TWO_PLACES)
    }

    /** Shared percent-off formula: round(base * (1 - percent/100), 2). */
    static applyPercentOff(base: number, percent: number): number {
        const pct = Math.min(Math.max(percent, 0.01), 100)
        return Math.round(base * (1 - pct / 100) * 100) / 100
    }
}