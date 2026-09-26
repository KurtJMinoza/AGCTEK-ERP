import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { SAMPLING_TYPES } from './quality.constants'

export type SamplingInput = {
    lotQuantity: Decimal | number
    samplingType?: string | null
    sampleSize?: Decimal | number | null
    samplePercent?: Decimal | number | null
    allowFullInspection?: boolean
}

@Injectable()
export class SamplingService {
    computeSampleQuantity(input: SamplingInput): { sampleQuantity: Decimal; samplingType: string } {
        const lotQty = new Decimal(input.lotQuantity)
        const type = (input.samplingType ?? 'FULL').toUpperCase()

        if (!SAMPLING_TYPES.includes(type as any)) {
            return { sampleQuantity: lotQty, samplingType: 'FULL' }
        }

        if (type === 'FULL' || input.allowFullInspection === true && type === 'FULL') {
            return { sampleQuantity: lotQty, samplingType: 'FULL' }
        }

        if (type === 'FIXED') {
            const size = new Decimal(input.sampleSize ?? lotQty)
            const sample = Decimal.min(size, lotQty)
            return { sampleQuantity: sample.lte(0) ? lotQty : sample, samplingType: 'FIXED' }
        }

        if (type === 'PERCENTAGE') {
            const pct = new Decimal(input.samplePercent ?? 100)
            const sample = lotQty.mul(pct).div(100)
            const rounded = sample.lt(1) && lotQty.gt(0) ? new Decimal(1) : sample.ceil()
            return {
                sampleQuantity: Decimal.min(rounded, lotQty),
                samplingType: 'PERCENTAGE',
            }
        }

        return { sampleQuantity: lotQty, samplingType: 'FULL' }
    }
}
