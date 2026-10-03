'use client'

import { useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Chart from '@/components/shared/Chart'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import { useDemandPastSales } from '../../hooks/useDemandPastSales'
import type {
    DemandMovingAverageWindow,
    DemandPastSales,
    DemandPlanBucket,
    DemandPlanDetail,
} from '../../types'

type Row = DemandPastSales['rows'][number] & { isTotal?: boolean }

export type GenerateRequest = {
    window: DemandMovingAverageWindow
    historyLength: number
    overwriteAdjustments: boolean
}

type Props = {
    plan: DemandPlanDetail | null
    bucket: DemandPlanBucket
    locationCode?: string
    generating: boolean
    /** Why Generate is unavailable (non-DRAFT, strategic, pending edits…); null = enabled. */
    generateDisabledReason: string | null
    onGenerate: (req: GenerateRequest) => void
}

const HISTORY_OPTIONS: Record<DemandPlanBucket, number[]> = {
    WEEK: [12, 26, 52],
    MONTH: [6, 12, 18],
    QUARTER: [4, 8, 12],
}

const WINDOW_OPTIONS: Array<{ value: DemandMovingAverageWindow; label: string }> = [
    { value: 4, label: 'Moving average N=4' },
    { value: 12, label: 'Moving average N=12' },
]

const fmt = (n: number) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

const unitLabel = (bucket: DemandPlanBucket, n: number) =>
    `${n} ${bucket === 'WEEK' ? 'weeks' : bucket === 'MONTH' ? 'months' : 'quarters'}`

export default function PastSalesPanel({
    plan,
    bucket,
    locationCode,
    generating,
    generateDisabledReason,
    onGenerate,
}: Props) {
    const [lengthByBucket, setLengthByBucket] = useState<
        Partial<Record<DemandPlanBucket, number>>
    >({})
    const historyLength = lengthByBucket[bucket] ?? HISTORY_OPTIONS[bucket][0]
    const [maWindow, setMaWindow] = useState<DemandMovingAverageWindow>(4)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const { data, loading, error } = useDemandPastSales(
        plan
            ? { versionId: plan.id, locationCode, bucket, historyLength }
            : null,
    )

    const columns = useMemo<ColumnDef<Row>[]>(() => {
        if (!data) return []
        const cols: ColumnDef<Row>[] = [
            {
                header: 'Product',
                id: 'product',
                size: 160,
                cell: ({ row }) =>
                    row.original.isTotal ? (
                        <span className="font-semibold">Total</span>
                    ) : (
                        <div className="min-w-[8rem]">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.original.productKey}
                            </div>
                            {row.original.family ? (
                                <div className="text-xs text-gray-400">
                                    {row.original.family}
                                </div>
                            ) : null}
                        </div>
                    ),
            },
            {
                header: 'Location',
                id: 'location',
                size: 100,
                cell: ({ row }) =>
                    row.original.isTotal
                        ? ''
                        : (data.locationNames?.[row.original.locationCode] ??
                          row.original.locationCode),
            },
        ]
        for (const p of data.periods) {
            cols.push({
                id: p.key,
                size: 90,
                header: () => (
                    <div className="whitespace-nowrap text-right">{p.label}</div>
                ),
                cell: ({ row }) => {
                    const v = row.original.isTotal
                        ? data.totals[p.key]
                        : row.original.cells[p.key]
                    return (
                        <div
                            className={`text-right ${row.original.isTotal ? 'font-semibold' : ''}`}
                        >
                            {v == null ? <span className="text-gray-300">—</span> : fmt(v)}
                        </div>
                    )
                },
            })
        }
        cols.push({
            id: 'total',
            size: 100,
            header: () => <div className="text-right">Total</div>,
            cell: ({ row }) => (
                <div className="text-right font-semibold">
                    {fmt(row.original.isTotal ? data.grandTotal : row.original.total)}
                </div>
            ),
        })
        return cols
    }, [data])

    const rows = useMemo<Row[]>(() => {
        if (!data || data.rows.length === 0) return []
        return [
            ...data.rows,
            {
                rowKey: '__total',
                productKey: 'Total',
                family: null,
                locationCode: '',
                cells: {},
                total: data.grandTotal,
                isTotal: true,
            },
        ]
    }, [data])

    const request = (overwriteAdjustments: boolean) => {
        setConfirmOpen(false)
        onGenerate({
            window: maWindow,
            historyLength: Math.max(maWindow, historyLength),
            overwriteAdjustments,
        })
    }

    const onGenerateClick = () => {
        if ((plan?.overrideCount ?? 0) > 0) setConfirmOpen(true)
        else request(false)
    }

    const historyOptions = HISTORY_OPTIONS[bucket].map((n) => ({
        value: n,
        label: `Last ${unitLabel(bucket, n)}`,
    }))
    const last = plan?.generationParams

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-4">
                    <FormItem label="History length" className="mb-0 w-48">
                        <Select
                            size="sm"
                            options={historyOptions}
                            value={historyOptions.find((o) => o.value === historyLength)}
                            onChange={(o) =>
                                o &&
                                setLengthByBucket((m) => ({ ...m, [bucket]: o.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Method" className="mb-0 w-56">
                        <Select
                            size="sm"
                            options={WINDOW_OPTIONS}
                            value={WINDOW_OPTIONS.find((o) => o.value === maWindow)}
                            onChange={(o) => o && setMaWindow(o.value)}
                        />
                    </FormItem>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Button
                        variant="solid"
                        size="sm"
                        loading={generating}
                        disabled={generateDisabledReason !== null || generating}
                        title={generateDisabledReason ?? undefined}
                        onClick={onGenerateClick}
                    >
                        Generate forecast
                    </Button>
                    <p className="text-[11px] text-gray-400">
                        {generateDisabledReason ??
                            `Averages the last ${maWindow} ${bucket.toLowerCase()} totals of past sales; frozen periods are skipped.`}
                    </p>
                </div>
            </div>

            {last && plan?.lastGeneratedAt ? (
                <p className="mb-3 text-xs text-gray-500">
                    Last generated {new Date(plan.lastGeneratedAt).toLocaleString()}
                    {plan.lastGeneratedBy ? ` by ${plan.lastGeneratedBy}` : ''} ·
                    moving average N={last.window} on {last.bucket.toLowerCase()} history ·{' '}
                    {last.periodsGenerated} periods · {last.preservedOverrides} overrides
                    preserved
                    {last.clearedOverrides ? ` · ${last.clearedOverrides} overwritten` : ''}
                </p>
            ) : null}

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            {data && data.periods.length > 0 && rows.length > 0 ? (
                <div className="mb-4">
                    <Chart
                        type="bar"
                        height={220}
                        xAxis={data.periods.map((p) => p.label)}
                        series={[
                            {
                                name: 'Past sales',
                                data: data.periods.map((p) => Math.round(data.totals[p.key] ?? 0)),
                            },
                        ]}
                        customOptions={{
                            chart: { toolbar: { show: false }, zoom: { enabled: false } },
                            dataLabels: { enabled: false },
                            legend: { show: false },
                            yaxis: { labels: { formatter: (v: number) => fmt(v) } },
                            tooltip: { y: { formatter: (v: number) => `${fmt(v)} units` } },
                        }}
                    />
                </div>
            ) : null}

            <div className="overflow-x-auto">
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    noData={!loading && rows.length === 0}
                    hidePagination
                    pagingData={{
                        total: rows.length,
                        pageIndex: 1,
                        pageSize: Math.max(rows.length, 10),
                    }}
                />
            </div>
            {!loading && data && rows.length === 0 ? (
                <p className="mt-2 text-xs text-gray-400">
                    No past sales for this plan&apos;s products in the last{' '}
                    {unitLabel(bucket, historyLength)}. Run{' '}
                    <code>npm run prisma:seed-demand-plan</code> in <code>backend/</code>{' '}
                    for demo actuals.
                </p>
            ) : null}

            <Dialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onRequestClose={() => setConfirmOpen(false)}
                width={520}
            >
                <h5 className="mb-1">Plan has planner overrides</h5>
                <p className="mb-4 text-sm text-gray-500">
                    {plan?.overrideCount} line{plan?.overrideCount === 1 ? '' : 's'}{' '}
                    carry a manual adjustment. Generation always refreshes the system
                    forecast; choose whether the overrides stay on top of it.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button onClick={() => request(true)}>
                        Generate &amp; overwrite adjustments
                    </Button>
                    <Button variant="solid" onClick={() => request(false)}>
                        Generate &amp; preserve adjustments
                    </Button>
                </div>
            </Dialog>
        </div>
    )
}
