'use client'

import type { DemandPlanChart } from '../../types'
import {
    deltaFromParts,
    deltaToneClass,
    formatDelta,
} from '../../utils/demandDelta'

const fmt = (n: number) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

const BASIS_LABEL: Record<DemandPlanChart['kpis']['varianceBasis'], string> = {
    COMPARE: 'vs comparison',
    HISTORY: 'vs history run-rate',
    SYSTEM: 'vs system forecast',
}

function Chip({
    label,
    value,
    hint,
    valueClass,
}: {
    label: string
    value: string
    hint?: string
    valueClass?: string
}) {
    return (
        <div className="min-w-[9rem] rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p
                className={`text-base font-semibold ${valueClass ?? 'text-gray-900 dark:text-gray-100'}`}
            >
                {value}
            </p>
            {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
        </div>
    )
}

type Props = {
    chart: DemandPlanChart
    periodCount: number
    bucketLabel: string
}

/** KPIs come from the server chart block — no client-side recomputation. */
export default function DemandPlanKpiChips({ chart, periodCount, bucketLabel }: Props) {
    const { kpis } = chart
    const variance = deltaFromParts(kpis.varianceAbs, kpis.variancePct)
    const span = `${periodCount} ${bucketLabel}${periodCount === 1 ? '' : 's'}`

    return (
        <div className="mb-4 flex flex-wrap gap-3">
            <Chip
                label="Forecast total"
                value={`${fmt(kpis.forecastTotal)} units`}
                hint={`Next ${span}`}
            />
            {kpis.historyTotal != null ? (
                <Chip
                    label="History run-rate"
                    value={`${fmt(kpis.historyTotal)} units`}
                    hint={`${kpis.historyWeeks} wk${kpis.historyWeeks === 1 ? '' : 's'} of actuals, scaled to window`}
                />
            ) : null}
            {kpis.compareTotal != null ? (
                <Chip
                    label="Comparison"
                    value={`${fmt(kpis.compareTotal)} units`}
                    hint="Compare version, same window"
                />
            ) : null}
            <Chip
                label="Variance"
                value={formatDelta(variance)}
                valueClass={deltaToneClass(variance)}
                hint={BASIS_LABEL[kpis.varianceBasis]}
            />
            <Chip
                label="Overrides"
                value={`${fmt(kpis.overrideCells)} cells`}
                hint={`System forecast ${fmt(kpis.systemTotal)} units`}
            />
        </div>
    )
}
