import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const Decimal = Prisma.Decimal
type Numeric = Prisma.Decimal | number | string

export type TaxClassification =
    | 'STANDARD'
    | 'ZERO_RATED'
    | 'EXEMPT'
    | 'NON_TAXABLE'
    | 'WITHHOLDING'

export type TaxCalculationInput = {
    taxCodeId: string
    taxCode: string
    companyId: string
    taxType: string
    calculationMethod: string
    roundingMethod: string
    roundingLevel: string
    decimalPrecision: number
    isRecoverable: boolean
    rate: { rate: Numeric; rateUnit: string } | null
    amount: Numeric
    transactionDate: string
    transactionType: string
}

export type TaxCalculationBreakdown = {
    componentName: string
    lineRate: number
    taxAmount: number
    recoverableAmount: number
    nonRecoverableAmount: number
}

export type TaxCalculationResult = {
    taxCodeId: string
    taxCode: string
    companyId: string
    transactionDate: string
    transactionType: string
    netAmount: number
    taxableBase: number
    taxRate: number
    rateUnit: string
    taxAmount: number
    grossAmount: number
    recoverableTax: number
    nonRecoverableTax: number
    calculationMethod: string
    classification: TaxClassification
    taxType: string
    breakdown: TaxCalculationBreakdown[]
}

export function taxClassificationOf(taxType: string): TaxClassification {
    switch (taxType) {
        case 'ZERO_RATED_TAX':
            return 'ZERO_RATED'
        case 'EXEMPT_TAX':
            return 'EXEMPT'
        case 'NON_TAXABLE':
            return 'NON_TAXABLE'
        case 'WITHHOLDING_TAX':
            return 'WITHHOLDING'
        default:
            return 'STANDARD'
    }
}

/**
 * Decimal-safe tax calculation engine.
 *
 * The engine never persists anything: MM, SD, AP, AR and journal documents own
 * their calculation snapshots. This service is a pure calculation used by the
 * configuration preview API and, later, by source-document integration.
 */
@Injectable()
export class FicoTaxCalculationService {
    calculate(input: TaxCalculationInput): TaxCalculationResult {
        let amount: Prisma.Decimal
        try {
            amount = new Decimal(input.amount)
        } catch {
            throw new BadRequestException(
                'Transaction amount must be a valid decimal number.',
            )
        }
        if (!amount.isFinite() || amount.lt(0)) {
            throw new BadRequestException(
                'Transaction amount must be a non-negative number.',
            )
        }

        const precision = Math.min(
            10,
            Math.max(0, Math.floor(Number(input.decimalPrecision ?? 2))),
        )
        const roundingMethod = input.roundingMethod ?? 'HALF_UP'
        const classification = taxClassificationOf(input.taxType)
        const rateValue = input.rate ? new Decimal(input.rate.rate) : new Decimal(0)
        const rateUnit = input.rate?.rateUnit ?? 'PERCENTAGE'

        if (!rateValue.isFinite() || rateValue.lt(0)) {
            throw new BadRequestException('Tax rate must be a non-negative number.')
        }
        if (rateUnit === 'PERCENTAGE' && rateValue.gt(100)) {
            throw new BadRequestException('Percentage tax rate cannot exceed 100%.')
        }

        const zeroLike =
            classification === 'ZERO_RATED' ||
            classification === 'EXEMPT' ||
            classification === 'NON_TAXABLE' ||
            input.calculationMethod === 'NOT_APPLICABLE'

        let gross = amount
        let net = amount
        let tax = new Decimal(0)

        if (zeroLike) {
            net = this.round(amount, roundingMethod, precision)
            gross = net
            tax = new Decimal(0)
        } else if (input.calculationMethod === 'TAX_INCLUSIVE') {
            gross = this.round(amount, roundingMethod, precision)
            if (rateUnit === 'PERCENTAGE') {
                const divisor = new Decimal(1).plus(rateValue.div(100))
                tax = gross.minus(gross.div(divisor))
            } else {
                tax = rateValue
                if (tax.gt(gross)) {
                    throw new BadRequestException(
                        'Fixed tax amount cannot exceed the tax-inclusive gross amount.',
                    )
                }
            }
            tax = this.round(tax, roundingMethod, precision)
            net = gross.minus(tax)
        } else {
            // TAX_EXCLUSIVE (or an unknown method, which is treated as exclusive).
            net = this.round(amount, roundingMethod, precision)
            tax =
                rateUnit === 'PERCENTAGE'
                    ? net.mul(rateValue).div(100)
                    : rateValue
            tax = this.round(tax, roundingMethod, precision)
            gross = net.plus(tax)
        }

        const recoverable = input.isRecoverable ? tax : new Decimal(0)
        const nonRecoverable = input.isRecoverable ? new Decimal(0) : tax

        return {
            taxCodeId: input.taxCodeId,
            taxCode: input.taxCode,
            companyId: input.companyId,
            transactionDate: input.transactionDate,
            transactionType: input.transactionType,
            netAmount: net.toNumber(),
            taxableBase: net.toNumber(),
            taxRate: rateValue.toNumber(),
            rateUnit,
            taxAmount: tax.toNumber(),
            grossAmount: gross.toNumber(),
            recoverableTax: recoverable.toNumber(),
            nonRecoverableTax: nonRecoverable.toNumber(),
            calculationMethod: input.calculationMethod,
            classification,
            taxType: input.taxType,
            // A single configured rate is one component. The rounding level is
            // captured on the tax code and applied by the calling document when
            // several lines are aggregated per document.
            breakdown: [
                {
                    componentName: input.taxCode,
                    lineRate: rateValue.toNumber(),
                    taxAmount: tax.toNumber(),
                    recoverableAmount: recoverable.toNumber(),
                    nonRecoverableAmount: nonRecoverable.toNumber(),
                },
            ],
        }
    }

    private round(
        value: Prisma.Decimal,
        method: string,
        precision: number,
    ): Prisma.Decimal {
        switch (method) {
            case 'HALF_DOWN':
                return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_DOWN)
            case 'HALF_EVEN':
                return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN)
            case 'UP':
                return value.toDecimalPlaces(precision, Decimal.ROUND_UP)
            case 'DOWN':
                return value.toDecimalPlaces(precision, Decimal.ROUND_DOWN)
            case 'HALF_UP':
            default:
                return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP)
        }
    }
}
