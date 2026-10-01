import type {
    DemandHorizonKind,
    DemandPlanBucket,
    DemandPlanGranularity,
} from '@prisma/client'

/** More series than this are never plotted individually. */
export const MAX_CHART_SERIES = 10
export const TOP_MOVERS = 5
export const OTHER_SERIES_KEY = '__other'

export type ChartDensityRequest = 'AUTO' | 'FAMILY'
export type ChartDensityMode = 'FULL' | 'TOP5_OTHER' | 'FAMILY'
export type VarianceBasis = 'COMPARE' | 'HISTORY' | 'SYSTEM'

export type ChartInputRow = {
    productKey: string
    family: string | null
    cells: Record<
        string,
        { qty: number; systemQty: number; adjusted: boolean; compareQty?: number | null }
    >
    historyQty: number | null
    /** Distinct weeks with actuals behind `historyQty`. */
    historyWeeks: number
}

export type ChartSeries = {
    key: string
    label: string
    productKey: string | null
    family: string | null
    values: Array<number | null>
    compareValues: Array<number | null> | null
    adjusted: boolean[]
    total: number
    baseTotal: number | null
    varianceAbs: number | null
    variancePct: number | null
    memberCount: number
}

export type ChartKpis = {
    forecastTotal: number
    systemTotal: number
    /** Actuals run-rate scaled to the forecast window (partial history is not compared raw). */
    historyTotal: number | null
    historyWeeks: number
    compareTotal: number | null
    varianceBasis: VarianceBasis
    varianceAbs: number
    variancePct: number | null
    overrideCells: number
}

export type ChartPayload = {
    densityMode: ChartDensityMode
    requestedDensity: ChartDensityRequest
    /** Distinct series before density control was applied. */
    seriesCount: number
    periodKeys: string[]
    freezePeriodIndexes: number[]
    series: ChartSeries[]
    /** Per forecast period: system forecast vs final (override-aware) totals. */
    systemTotals: number[]
    finalTotals: number[]
    /** Past sales totals for the periods just before the forecast window (plan bucket). */
    history: Array<{ key: string; label: string; qty: number | null }>
    kpis: ChartKpis
    meta: {
        horizonKind: DemandHorizonKind
        bucket: DemandPlanBucket
        granularity: DemandPlanGranularity
        hasCompare: boolean
    }
}

type Acc = {
    key: string
    label: string
    productKey: string | null
    family: string | null
    values: Array<number | null>
    compareValues: Array<number | null>
    adjusted: boolean[]
    system: number
    history: number | null
    memberCount: number
}

const pct = (abs: number, base: number | null) =>
    base == null || base === 0 ? null : (abs / base) * 100

function addNullable(a: number | null, b: number | null | undefined) {
    if (b == null) return a
    return (a ?? 0) + b
}

/**
 * Builds chart series + KPIs from rows the database has already aggregated to the
 * requested horizon grain. Only regroups those rows (SKU → family, locations summed);
 * never touches base-grain lines.
 */
export function buildChart(input: {
    periods: Array<{ key: string; frozen: boolean }>
    rows: ChartInputRow[]
    hasCompare: boolean
    density: ChartDensityRequest
    /** Forecast window length in weeks, for scaling history run-rate. */
    windowWeeks: number
    horizonKind: DemandHorizonKind
    bucket: DemandPlanBucket
    granularity: DemandPlanGranularity
    history?: Array<{ key: string; label: string; qty: number | null }>
}): ChartPayload {
    const { periods, rows, hasCompare, density, granularity, windowWeeks } = input
    const n = periods.length
    const byFamily = density === 'FAMILY' || granularity === 'FAMILY'
    const scaledHistory = (r: ChartInputRow) =>
        r.historyQty == null || r.historyWeeks <= 0
            ? null
            : (r.historyQty / r.historyWeeks) * windowWeeks
    const hasHistory = rows.some((r) => scaledHistory(r) != null)

    const accs = new Map<string, Acc>()
    const systemTotals = Array<number>(n).fill(0)
    const finalTotals = Array<number>(n).fill(0)
    let overrideCells = 0
    for (const row of rows) {
        const key = byFamily
            ? granularity === 'FAMILY'
                ? row.productKey
                : (row.family ?? 'UNASSIGNED')
            : row.productKey
        let acc = accs.get(key)
        if (!acc) {
            acc = {
                key,
                label: key,
                productKey: byFamily ? null : row.productKey,
                family: byFamily ? key : row.family,
                values: Array<number | null>(n).fill(null),
                compareValues: Array<number | null>(n).fill(null),
                adjusted: Array<boolean>(n).fill(false),
                system: 0,
                history: null,
                memberCount: 0,
            }
            accs.set(key, acc)
        }
        acc.memberCount += 1
        acc.history = addNullable(acc.history, scaledHistory(row))
        periods.forEach((p, i) => {
            const c = row.cells[p.key]
            if (!c) return
            systemTotals[i] += c.systemQty
            finalTotals[i] += c.qty
            acc.values[i] = (acc.values[i] ?? 0) + c.qty
            acc.compareValues[i] = addNullable(acc.compareValues[i], c.compareQty)
            acc.system += c.systemQty
            if (c.adjusted) {
                acc.adjusted[i] = true
                overrideCells += 1
            }
        })
    }

    const basis: VarianceBasis = hasCompare
        ? 'COMPARE'
        : hasHistory
          ? 'HISTORY'
          : 'SYSTEM'

    const series: ChartSeries[] = [...accs.values()].map((a) => {
        const total = a.values.reduce<number>((s, v) => s + (v ?? 0), 0)
        const compareTotal = a.compareValues.some((v) => v != null)
            ? a.compareValues.reduce<number>((s, v) => s + (v ?? 0), 0)
            : null
        const baseTotal =
            basis === 'COMPARE'
                ? compareTotal
                : basis === 'HISTORY'
                  ? a.history
                  : a.system
        const varianceAbs = baseTotal == null ? null : total - baseTotal
        return {
            key: a.key,
            label: a.label,
            productKey: a.productKey,
            family: a.family,
            values: a.values,
            compareValues: hasCompare ? a.compareValues : null,
            adjusted: a.adjusted,
            total,
            baseTotal,
            varianceAbs,
            variancePct: varianceAbs == null ? null : pct(varianceAbs, baseTotal),
            memberCount: a.memberCount,
        }
    })
    series.sort((x, y) => x.label.localeCompare(y.label))

    const seriesCount = series.length
    let densityMode: ChartDensityMode = byFamily && granularity === 'SKU' ? 'FAMILY' : 'FULL'
    let plotted = series
    if (seriesCount > MAX_CHART_SERIES) {
        densityMode = 'TOP5_OTHER'
        const ranked = [...series].sort(
            (x, y) => Math.abs(y.varianceAbs ?? 0) - Math.abs(x.varianceAbs ?? 0),
        )
        const top = ranked.slice(0, TOP_MOVERS)
        plotted = [...top, mergeOther(ranked.slice(TOP_MOVERS), n, hasCompare)]
    }

    const forecastTotal = series.reduce((s, x) => s + x.total, 0)
    const systemTotal = [...accs.values()].reduce((s, a) => s + a.system, 0)
    const historyTotal = hasHistory
        ? rows.reduce((s, r) => s + (scaledHistory(r) ?? 0), 0)
        : null
    const historyWeeks = rows.reduce((m, r) => Math.max(m, r.historyWeeks), 0)
    const compareTotal = hasCompare
        ? series.reduce((s, x) => s + (x.baseTotal ?? 0), 0)
        : null
    const base =
        basis === 'COMPARE' ? compareTotal : basis === 'HISTORY' ? historyTotal : systemTotal
    const varianceAbs = forecastTotal - (base ?? 0)

    return {
        densityMode,
        requestedDensity: density,
        seriesCount,
        periodKeys: periods.map((p) => p.key),
        freezePeriodIndexes: periods.flatMap((p, i) => (p.frozen ? [i] : [])),
        series: plotted,
        systemTotals,
        finalTotals,
        history: input.history ?? [],
        kpis: {
            forecastTotal,
            systemTotal,
            historyTotal,
            historyWeeks,
            compareTotal,
            varianceBasis: basis,
            varianceAbs,
            variancePct: pct(varianceAbs, base),
            overrideCells,
        },
        meta: {
            horizonKind: input.horizonKind,
            bucket: input.bucket,
            granularity,
            hasCompare,
        },
    }
}

function mergeOther(rest: ChartSeries[], n: number, hasCompare: boolean): ChartSeries {
    const values = Array<number | null>(n).fill(null)
    const compareValues = Array<number | null>(n).fill(null)
    const adjusted = Array<boolean>(n).fill(false)
    let total = 0
    let baseTotal: number | null = null
    let members = 0
    for (const s of rest) {
        total += s.total
        baseTotal = addNullable(baseTotal, s.baseTotal)
        members += s.memberCount
        for (let i = 0; i < n; i += 1) {
            values[i] = addNullable(values[i], s.values[i])
            if (s.compareValues) compareValues[i] = addNullable(compareValues[i], s.compareValues[i])
            adjusted[i] = adjusted[i] || s.adjusted[i]
        }
    }
    const varianceAbs = baseTotal == null ? null : total - baseTotal
    return {
        key: OTHER_SERIES_KEY,
        label: `Other (${rest.length})`,
        productKey: null,
        family: null,
        values,
        compareValues: hasCompare ? compareValues : null,
        adjusted,
        total,
        baseTotal,
        varianceAbs,
        variancePct: varianceAbs == null ? null : pct(varianceAbs, baseTotal),
        memberCount: members,
    }
}
