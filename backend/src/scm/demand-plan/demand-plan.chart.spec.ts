import { buildChart, OTHER_SERIES_KEY, type ChartInputRow } from './demand-plan.chart'

const periods = [
    { key: 'p1', frozen: true },
    { key: 'p2', frozen: false },
]

function row(
    sku: string,
    family: string,
    q1: number,
    q2: number,
    compare?: [number, number],
    history: number | null = null,
): ChartInputRow {
    return {
        productKey: sku,
        family,
        historyQty: history,
        historyWeeks: history == null ? 0 : 2,
        cells: {
            p1: { qty: q1, systemQty: q1, adjusted: false, compareQty: compare?.[0] },
            p2: { qty: q2, systemQty: q2 - 10, adjusted: true, compareQty: compare?.[1] },
        },
    }
}

const base = {
    periods,
    windowWeeks: 2,
    horizonKind: 'OPERATIONAL' as const,
    bucket: 'WEEK' as const,
    granularity: 'SKU' as const,
}

describe('buildChart', () => {
    it('sums locations per SKU and reports freeze indexes + KPIs vs compare', () => {
        const chart = buildChart({
            ...base,
            hasCompare: true,
            density: 'AUTO',
            rows: [row('A', 'F1', 100, 200, [100, 150]), row('A', 'F1', 50, 50, [50, 50])],
        })
        expect(chart.densityMode).toBe('FULL')
        expect(chart.freezePeriodIndexes).toEqual([0])
        expect(chart.series).toHaveLength(1)
        expect(chart.series[0].values).toEqual([150, 250])
        expect(chart.series[0].compareValues).toEqual([150, 200])
        expect(chart.kpis.varianceBasis).toBe('COMPARE')
        expect(chart.kpis.varianceAbs).toBe(50)
        expect(chart.kpis.variancePct).toBeCloseTo(50 / 350 * 100)
        expect(chart.kpis.overrideCells).toBe(2)
    })

    it('rolls SKUs to family when requested', () => {
        const chart = buildChart({
            ...base,
            hasCompare: false,
            density: 'FAMILY',
            rows: [row('A', 'F1', 1, 1), row('B', 'F1', 2, 2), row('C', 'F2', 3, 3)],
        })
        expect(chart.densityMode).toBe('FAMILY')
        expect(chart.series.map((s) => s.key)).toEqual(['F1', 'F2'])
        expect(chart.series[0].values).toEqual([3, 3])
    })

    it('scales partial history to the forecast window as a run-rate', () => {
        const chart = buildChart({
            ...base,
            windowWeeks: 24,
            hasCompare: false,
            density: 'AUTO',
            rows: [{ ...row('A', 'F1', 150, 150), historyQty: 120, historyWeeks: 12 }],
        })
        expect(chart.kpis.varianceBasis).toBe('HISTORY')
        expect(chart.kpis.historyTotal).toBe(240)
        expect(chart.kpis.historyWeeks).toBe(12)
        expect(chart.kpis.varianceAbs).toBe(300 - 240)
    })

    it('plots Top 5 variance movers + Other when more than 10 series', () => {
        const rows = Array.from({ length: 12 }, (_, i) =>
            // variance vs history grows with i
            row(`S${String(i).padStart(2, '0')}`, 'F', 100 + i * 10, 100, undefined, 200),
        )
        const chart = buildChart({ ...base, hasCompare: false, density: 'AUTO', rows })
        expect(chart.seriesCount).toBe(12)
        expect(chart.densityMode).toBe('TOP5_OTHER')
        expect(chart.series).toHaveLength(6)
        expect(chart.series.slice(0, 5).map((s) => s.key)).toEqual([
            'S11',
            'S10',
            'S09',
            'S08',
            'S07',
        ])
        const other = chart.series[5]
        expect(other.key).toBe(OTHER_SERIES_KEY)
        expect(other.memberCount).toBe(7)
        const plottedTotal = chart.series.reduce((s, x) => s + x.total, 0)
        expect(plottedTotal).toBe(chart.kpis.forecastTotal)
        expect(chart.kpis.varianceBasis).toBe('HISTORY')
    })
})
