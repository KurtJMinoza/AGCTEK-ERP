import { Decimal } from '@prisma/client/runtime/library'

export type ScoreWeights = {
    deliveryWeight: number
    qualityWeight: number
    priceWeight: number
    quantityWeight: number
    serviceWeight: number
    complianceWeight: number
}

export type DeliveryEvent = {
    promisedDate: Date | null
    actualDate: Date
}

export type QualityLine = {
    quantity: number
    passQuantity: number
    failQuantity: number
}

export type GrDamagedLine = {
    quantity: number
    damagedQuantity: number
}

export type LeadTimePair = {
    actualLeadDays: number
    promisedLeadDays: number
}

export type PricePair = {
    poUnitPrice: number
    invoiceUnitPrice: number
    historicalUnitPrice?: number | null
    landedUnitCost?: number | null
}

export type QuantityPair = {
    orderedQty: number
    receivedQty: number
}

export type RfqResponseEvent = {
    invitedAt: Date
    respondedAt: Date | null
    responseDeadline: Date | null
}

export type ComplianceSample = {
    totalEvents: number
    exceptionEvents: number
}

export type MetricInputs = {
    deliveries: DeliveryEvent[]
    qualityLines: QualityLine[]
    grLines: GrDamagedLine[]
    leadTimes: LeadTimePair[]
    prices: PricePair[]
    quantities?: QuantityPair[]
    rfqResponses: RfqResponseEvent[]
    compliance: ComplianceSample
    purchaseVolume: number
    /** Qty returned to supplier in period (SHIPPED/COMPLETED returns). */
    supplierReturnQty?: number
    /** Receiving variance events (shortage/overage/discrepancy) for compliance. */
    receivingVarianceEvents?: number
}

export type ComputedMetrics = {
    onTimePct: number
    lateDeliveryRate: number
    avgDelayDays: number
    qualityAcceptanceRate: number
    rejectionRate: number
    returnRate: number
    leadTimeAccuracyPct: number
    priceVariancePct: number
    landedCostVariancePct: number
    fillRate: number
    shortageRate: number
    overDeliveryRate: number
    avgResponseHours: number
    complianceRate: number
    purchaseVolume: number
    deliveryScore: number
    qualityScore: number
    priceScore: number
    quantityScore: number
    serviceScore: number
    complianceScore: number
    overallScore: number
    sampleSizes: {
        deliveries: number
        deliveriesWithPromise: number
        qualityLines: number
        grLines: number
        leadTimes: number
        prices: number
        quantities: number
        rfqResponses: number
        complianceEvents: number
    }
}

function clamp(n: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, n))
}

function avg(nums: number[]) {
    if (!nums.length) return 0
    return nums.reduce((a, b) => a + b, 0) / nums.length
}

function dayStart(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Pure scoring helpers — unit-tested independently of Prisma.
 */
export function computeOnTimePct(deliveries: DeliveryEvent[]): {
    onTimePct: number
    lateDeliveryRate: number
    avgDelayDays: number
    withPromise: number
    onTime: number
    late: number
} {
    let withPromise = 0
    let onTime = 0
    let late = 0
    const delays: number[] = []
    for (const d of deliveries) {
        if (!d.promisedDate) continue
        withPromise++
        const actual = dayStart(d.actualDate).getTime()
        const promised = dayStart(d.promisedDate).getTime()
        if (actual <= promised) {
            onTime++
        } else {
            late++
            delays.push((actual - promised) / (24 * 60 * 60 * 1000))
        }
    }
    return {
        onTimePct: withPromise ? onTime / withPromise : 0,
        lateDeliveryRate: withPromise ? late / withPromise : 0,
        avgDelayDays: delays.length ? avg(delays) : 0,
        withPromise,
        onTime,
        late,
    }
}

/**
 * Quality = accepted / received.
 * Return = returned / received (supplier return qty only — not QI fail/damage).
 */
export function computeQualityAcceptance(
    qualityLines: QualityLine[],
    grLines: GrDamagedLine[],
    supplierReturnQty = 0,
): {
    acceptanceRate: number
    rejectionRate: number
    returnRate: number
    sample: number
    receivedQty: number
} {
    const returned = Math.max(0, Number(supplierReturnQty) || 0)

    let received = 0
    let accepted = 0
    let rejected = 0

    if (qualityLines.length) {
        for (const q of qualityLines) {
            received += Number(q.quantity) || 0
            accepted += Number(q.passQuantity) || 0
            rejected += Number(q.failQuantity) || 0
        }
    } else {
        let damaged = 0
        for (const g of grLines) {
            received += Number(g.quantity) || 0
            damaged += Number(g.damagedQuantity) || 0
        }
        accepted = Math.max(0, received - damaged)
        rejected = damaged
    }

    return {
        acceptanceRate: received > 0 ? clamp(accepted / received, 0, 1) : 0,
        rejectionRate: received > 0 ? clamp(rejected / received, 0, 1) : 0,
        returnRate: received > 0 ? clamp(returned / received, 0, 1) : 0,
        sample: qualityLines.length || grLines.length,
        receivedQty: received,
    }
}

/** Quantity accuracy: fill / shortage / over-delivery vs ordered. */
export function computeQuantityAccuracy(pairs: QuantityPair[]): {
    fillRate: number
    shortageRate: number
    overDeliveryRate: number
    quantityScore: number
} {
    if (!pairs.length) {
        return {
            fillRate: 0,
            shortageRate: 0,
            overDeliveryRate: 0,
            quantityScore: 0,
        }
    }
    let ordered = 0
    let received = 0
    let shortLines = 0
    let overLines = 0
    for (const p of pairs) {
        const o = Math.max(0, Number(p.orderedQty) || 0)
        const r = Math.max(0, Number(p.receivedQty) || 0)
        ordered += o
        received += r
        if (o > 0 && r < o) shortLines++
        if (o > 0 && r > o) overLines++
    }
    const fillRate = ordered > 0 ? clamp(Math.min(received, ordered) / ordered, 0, 1) : 0
    const shortageRate = ordered > 0 ? clamp(Math.max(0, ordered - received) / ordered, 0, 1) : 0
    const overDeliveryRate =
        ordered > 0 ? clamp(Math.max(0, received - ordered) / ordered, 0, 1) : 0
    // Score favors fill, penalizes shortage and over-delivery
    const quantityScore = clamp(
        fillRate * 100 - shortageRate * 40 - overDeliveryRate * 20,
    )
    return {
        fillRate,
        shortageRate,
        overDeliveryRate,
        quantityScore,
    }
}

/** Rank suppliers by overall score for comparison views / tests. */
export function compareSupplierScores(
    rows: Array<{
        supplierId: string
        overallScore: number
        deliveryScore?: number
        qualityScore?: number
        priceScore?: number
        quantityScore?: number
        returnRate?: number
    }>,
) {
    return [...rows]
        .map((r) => ({
            supplierId: r.supplierId,
            overallScore: Number(r.overallScore),
            deliveryScore: r.deliveryScore != null ? Number(r.deliveryScore) : undefined,
            qualityScore: r.qualityScore != null ? Number(r.qualityScore) : undefined,
            priceScore: r.priceScore != null ? Number(r.priceScore) : undefined,
            quantityScore: r.quantityScore != null ? Number(r.quantityScore) : undefined,
            returnRate: r.returnRate != null ? Number(r.returnRate) : undefined,
        }))
        .sort((a, b) => b.overallScore - a.overallScore)
        .map((r, idx) => ({ ...r, rank: idx + 1 }))
}

export function computeLeadTimeAccuracyPct(pairs: LeadTimePair[]): number {
    if (!pairs.length) return 0
    const scores = pairs.map((p) => {
        const promised = Math.max(Number(p.promisedLeadDays) || 0, 1)
        const actual = Math.max(Number(p.actualLeadDays) || 0, 0)
        const score = 100 - (Math.abs(actual - promised) / promised) * 100
        return clamp(score)
    })
    return avg(scores)
}

export function computePriceVariance(
    prices: PricePair[],
): {
    avgAbsVariancePct: number
    landedCostVariancePct: number
    priceScore: number
} {
    if (!prices.length) {
        return { avgAbsVariancePct: 0, landedCostVariancePct: 0, priceScore: 0 }
    }
    const variances: number[] = []
    const landedVars: number[] = []
    const scores: number[] = []
    for (const p of prices) {
        const po = Number(p.poUnitPrice) || 0
        const inv = Number(p.invoiceUnitPrice) || 0
        const hist = p.historicalUnitPrice != null ? Number(p.historicalUnitPrice) : null
        const landed = p.landedUnitCost != null ? Number(p.landedUnitCost) : null
        const base = po > 0 ? po : hist && hist > 0 ? hist : 0
        if (base <= 0) continue
        const absPct = Math.abs(inv - base) / base
        variances.push(absPct)
        if (landed != null && landed > 0) {
            landedVars.push(Math.abs(landed - base) / base)
        }
        const over = inv > base ? absPct : absPct * 0.5
        scores.push(clamp(100 - over * 100))
    }
    if (!variances.length) {
        return { avgAbsVariancePct: 0, landedCostVariancePct: 0, priceScore: 0 }
    }
    return {
        avgAbsVariancePct: avg(variances),
        landedCostVariancePct: landedVars.length ? avg(landedVars) : 0,
        priceScore: avg(scores),
    }
}

export function computeServiceScore(events: RfqResponseEvent[]): {
    avgResponseHours: number
    serviceScore: number
    responded: number
} {
    const responded = events.filter((e) => e.respondedAt)
    if (!responded.length) {
        return { avgResponseHours: 0, serviceScore: 0, responded: 0 }
    }

    let onTime = 0
    const hours: number[] = []
    for (const e of responded) {
        const hrs =
            (e.respondedAt!.getTime() - e.invitedAt.getTime()) / (1000 * 60 * 60)
        hours.push(Math.max(0, hrs))
        if (!e.responseDeadline || e.respondedAt! <= e.responseDeadline) {
            onTime++
        }
    }
    const avgHours = avg(hours)
    const onTimeRate = onTime / responded.length
    const speedScore = clamp(100 - (avgHours / (14 * 24)) * 100)
    const serviceScore = clamp(onTimeRate * 70 + (speedScore / 100) * 30)
    return { avgResponseHours: avgHours, serviceScore, responded: responded.length }
}

export function computeComplianceRate(sample: ComplianceSample): number {
    if (!sample.totalEvents) return 0
    const clean = Math.max(0, sample.totalEvents - sample.exceptionEvents)
    return clean / sample.totalEvents
}

export function applyWeights(
    scores: {
        deliveryScore: number
        qualityScore: number
        priceScore: number
        quantityScore: number
        serviceScore: number
        complianceScore: number
    },
    weights: ScoreWeights,
): number {
    const sum =
        weights.deliveryWeight +
        weights.qualityWeight +
        weights.priceWeight +
        weights.quantityWeight +
        weights.serviceWeight +
        weights.complianceWeight
    if (sum !== 100) {
        throw new Error(`Weights must sum to 100 (got ${sum})`)
    }
    const overall =
        (scores.deliveryScore * weights.deliveryWeight +
            scores.qualityScore * weights.qualityWeight +
            scores.priceScore * weights.priceWeight +
            scores.quantityScore * weights.quantityWeight +
            scores.serviceScore * weights.serviceWeight +
            scores.complianceScore * weights.complianceWeight) /
        100
    return clamp(overall)
}

export function computeSupplierMetrics(
    input: MetricInputs,
    weights: ScoreWeights,
): ComputedMetrics {
    const ot = computeOnTimePct(input.deliveries)
    const qi = computeQualityAcceptance(
        input.qualityLines,
        input.grLines,
        input.supplierReturnQty ?? 0,
    )
    const leadPct = computeLeadTimeAccuracyPct(input.leadTimes)
    const price = computePriceVariance(input.prices)
    const qty = computeQuantityAccuracy(input.quantities ?? [])
    const service = computeServiceScore(input.rfqResponses)
    const complianceRate = computeComplianceRate(input.compliance)

    let deliveryScore = ot.onTimePct * 100
    if (input.leadTimes.length && ot.withPromise) {
        deliveryScore = ot.onTimePct * 100 * 0.7 + leadPct * 0.3
    } else if (!ot.withPromise && input.leadTimes.length) {
        deliveryScore = leadPct
    }

    const qualityScore = qi.acceptanceRate * 100
    const priceScore = price.priceScore
    const quantityScore = qty.quantityScore
    const serviceScore = service.serviceScore
    let complianceScore = complianceRate * 100
    if (input.receivingVarianceEvents && input.compliance.totalEvents > 0) {
        const varianceRate = Math.min(
            1,
            input.receivingVarianceEvents / Math.max(input.compliance.totalEvents, 1),
        )
        complianceScore = clamp(complianceScore * (1 - varianceRate * 0.5))
    }

    const overallScore = applyWeights(
        {
            deliveryScore,
            qualityScore,
            priceScore,
            quantityScore,
            serviceScore,
            complianceScore,
        },
        weights,
    )

    return {
        onTimePct: ot.onTimePct,
        lateDeliveryRate: ot.lateDeliveryRate,
        avgDelayDays: ot.avgDelayDays,
        qualityAcceptanceRate: qi.acceptanceRate,
        rejectionRate: qi.rejectionRate,
        returnRate: qi.returnRate,
        leadTimeAccuracyPct: leadPct / 100,
        priceVariancePct: price.avgAbsVariancePct,
        landedCostVariancePct: price.landedCostVariancePct,
        fillRate: qty.fillRate,
        shortageRate: qty.shortageRate,
        overDeliveryRate: qty.overDeliveryRate,
        avgResponseHours: service.avgResponseHours,
        complianceRate,
        purchaseVolume: input.purchaseVolume,
        deliveryScore: clamp(deliveryScore),
        qualityScore: clamp(qualityScore),
        priceScore: clamp(priceScore),
        quantityScore: clamp(quantityScore),
        serviceScore: clamp(serviceScore),
        complianceScore: clamp(complianceScore),
        overallScore,
        sampleSizes: {
            deliveries: input.deliveries.length,
            deliveriesWithPromise: ot.withPromise,
            qualityLines: input.qualityLines.length,
            grLines: input.grLines.length,
            leadTimes: input.leadTimes.length,
            prices: input.prices.length,
            quantities: (input.quantities ?? []).length,
            rfqResponses: service.responded,
            complianceEvents: input.compliance.totalEvents,
        },
    }
}

export function toDecimal(n: number) {
    return new Decimal(Number.isFinite(n) ? n : 0)
}

/**
 * Aggregate trend points chronologically for charts / tests.
 */
export function aggregateTrend(
    evaluations: Array<{
        periodStart: Date
        periodEnd: Date
        overallScore: number | Decimal
        deliveryScore: number | Decimal
        qualityScore: number | Decimal
        priceScore: number | Decimal
        quantityScore?: number | Decimal
        serviceScore: number | Decimal
        complianceScore: number | Decimal
        purchaseVolume: number | Decimal
    }>,
) {
    return [...evaluations]
        .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
        .map((e) => ({
            periodStart: e.periodStart,
            periodEnd: e.periodEnd,
            overallScore: Number(e.overallScore),
            deliveryScore: Number(e.deliveryScore),
            qualityScore: Number(e.qualityScore),
            priceScore: Number(e.priceScore),
            quantityScore: e.quantityScore != null ? Number(e.quantityScore) : 0,
            serviceScore: Number(e.serviceScore),
            complianceScore: Number(e.complianceScore),
            purchaseVolume: Number(e.purchaseVolume),
        }))
}
