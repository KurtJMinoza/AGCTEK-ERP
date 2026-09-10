'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import GrowShrinkValue from '@/components/shared/GrowShrinkValue'
import EChart, {
    buildBarOption,
    buildDonutOption,
    buildMovementComboOption,
} from '@/components/shared/EChart'
import { COLORS } from '@/constants/chart.constant'
import Button from '@/components/ui/Button'
import Segment from '@/components/ui/Segment'
import Tabs from '@/components/ui/Tabs'
import type { MmDashboard } from '../types'

type DashboardAnalyticsTabProps = {
    dash: MmDashboard | null
    loading: boolean
    chartFocus: 'all' | 'inbound' | 'outbound'
    onChartFocusChange: (focus: 'all' | 'inbound' | 'outbound') => void
    analyticsTab: string
    onAnalyticsTabChange: (tab: string) => void
    movementOption: ReturnType<typeof buildMovementComboOption>
    agingDonutOption: ReturnType<typeof buildDonutOption>
    agingBarOption: ReturnType<typeof buildBarOption>
    spendBarOption: ReturnType<typeof buildBarOption>
}

function fmt(n: number, digits = 2) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function DashboardAnalyticsTab({
    dash,
    loading,
    chartFocus,
    onChartFocusChange,
    analyticsTab,
    onAnalyticsTabChange,
    movementOption,
    agingDonutOption,
    agingBarOption,
    spendBarOption,
}: DashboardAnalyticsTabProps) {
    const movementSeries = dash?.analytics?.movement?.series ?? []
    const agingBuckets = dash?.analytics?.aging?.buckets ?? []
    const deadRows = dash?.analytics?.deadStock?.rows ?? []
    const turnoverRows = dash?.analytics?.turnover?.rows ?? []
    const spendBySupplier = dash?.analytics?.spend?.bySupplier ?? []
    const topSuppliers = dash?.analytics?.suppliers?.top ?? []

    const agingTotal = agingBuckets.reduce(
        (s: number, b: any) => s + Number(b.quantity ?? 0),
        0,
    )
    const agingDonut = agingBuckets.map((b: any) => Number(b.quantity ?? 0))

    const deadColumns: ColumnDef<any>[] = [
        {
            header: 'Material',
            cell: ({ row }) => (
                <div>
                    <div className="font-semibold heading-text">
                        {row.original.materialCode ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500">{row.original.materialName}</div>
                </div>
            ),
        },
        {
            header: 'Qty',
            cell: ({ row }) => fmt(Number(row.original.quantity), 0),
        },
        {
            header: 'Days idle',
            cell: ({ row }) => Number(row.original.daysWithoutMovement ?? 0),
        },
        {
            header: 'Status',
            cell: ({ row }) => {
                const days = Number(row.original.daysWithoutMovement ?? 0)
                return (
                    <StatusBadge tone={days >= 90 ? 'danger' : days >= 60 ? 'warning' : 'success'}>
                        {days >= 90 ? 'High' : days >= 60 ? 'Watch' : 'OK'}
                    </StatusBadge>
                )
            },
        },
    ]

    if (dash?.visibility?.analytics === false) {
        return (
            <AdaptiveCard>
                <p className="py-10 text-center text-sm text-gray-500">
                    Analytics are not available for your role.
                </p>
            </AdaptiveCard>
        )
    }

    return (
        <>
            <AdaptiveCard
                className="mb-4"
                header={{
                    content: 'Stock movement',
                    extra: (
                        <div className="flex flex-wrap items-center gap-2">
                            <Segment
                                size="sm"
                                value={chartFocus}
                                onChange={(val) =>
                                    onChartFocusChange(String(val) as 'all' | 'inbound' | 'outbound')
                                }
                            >
                                <Segment.Item value="all">All</Segment.Item>
                                <Segment.Item value="inbound">Inbound</Segment.Item>
                                <Segment.Item value="outbound">Outbound</Segment.Item>
                            </Segment>
                            <Link href="/modules/mm/inventory-management/stock-movements">
                                <Button size="xs">View</Button>
                            </Link>
                        </div>
                    ),
                }}
            >
                {movementSeries.length > 0 ? (
                    <EChart option={movementOption} height={320} />
                ) : (
                    <p className="py-16 text-center text-sm text-gray-500">
                        {loading ? 'Loading…' : 'No movement data in range.'}
                    </p>
                )}
            </AdaptiveCard>

            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AdaptiveCard
                    className="min-w-0"
                    header={{
                        content: 'Stock aging',
                        extra: (
                            <Link href="/modules/mm/reports-analytics/stock-aging">
                                <Button size="xs">Report</Button>
                            </Link>
                        ),
                    }}
                >
                    {agingDonut.length > 0 ? (
                        <>
                            <EChart option={agingDonutOption} height={220} />
                            <div className="mt-3 space-y-2">
                                {agingBuckets.map((b: any, i: number) => {
                                    const qty = Number(b.quantity ?? 0)
                                    const pct = agingTotal
                                        ? Math.round((qty / agingTotal) * 1000) / 10
                                        : 0
                                    return (
                                        <div
                                            key={b.name ?? i}
                                            className="flex min-w-0 items-center justify-between gap-2 text-sm"
                                        >
                                            <span className="flex min-w-0 items-center gap-2 truncate text-gray-500">
                                                <span
                                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor: COLORS[i % COLORS.length],
                                                    }}
                                                />
                                                {b.name}
                                            </span>
                                            <span className="shrink-0 font-semibold tabular-nums">
                                                {pct}% · {fmt(qty, 0)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    ) : (
                        <p className="py-10 text-center text-sm text-gray-500">No aging data.</p>
                    )}
                </AdaptiveCard>

                <AdaptiveCard
                    className="min-w-0"
                    header={{
                        content: 'Dead stock',
                        extra: (
                            <Link href="/modules/mm/reports-analytics/dead-stock">
                                <Button size="xs">Report</Button>
                            </Link>
                        ),
                    }}
                >
                    <DataTable
                        columns={deadColumns}
                        data={deadRows.slice(0, 8)}
                        loading={loading}
                        noData={!loading && deadRows.length === 0}
                    />
                </AdaptiveCard>
            </div>

            <AdaptiveCard header={{ content: 'Detailed analytics' }}>
                <Tabs value={analyticsTab} onChange={(v) => onAnalyticsTabChange(v as string)}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="aging">Aging</Tabs.TabNav>
                        <Tabs.TabNav value="turnover">Turnover</Tabs.TabNav>
                        <Tabs.TabNav value="spend">Procurement spend</Tabs.TabNav>
                        <Tabs.TabNav value="suppliers">Suppliers</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                <div className="mt-4">
                    {analyticsTab === 'aging' &&
                        (agingBuckets.length > 0 ? (
                            <EChart option={agingBarOption} height={300} />
                        ) : (
                            <p className="text-sm text-gray-500">No aging data.</p>
                        ))}

                    {analyticsTab === 'turnover' && (
                        <>
                            <Link
                                className="text-sm font-medium text-primary"
                                href="/modules/mm/reports-analytics/inventory-turnover"
                            >
                                Full turnover report →
                            </Link>
                            <DataTable
                                className="mt-2"
                                columns={[
                                    { header: 'Material', accessorKey: 'materialCode' },
                                    { header: 'Issue qty', accessorKey: 'issueQty' },
                                    { header: 'Avg on hand', accessorKey: 'averageOnHand' },
                                    {
                                        header: 'Turnover',
                                        cell: ({ row }: any) =>
                                            fmt(Number(row.original.turnover), 2),
                                    },
                                ]}
                                data={turnoverRows}
                            />
                        </>
                    )}

                    {analyticsTab === 'spend' && (
                        <>
                            <Link
                                className="text-sm font-medium text-primary"
                                href="/modules/mm/reports-analytics/procurement-analytics"
                            >
                                Full spend report →
                            </Link>
                            {spendBySupplier.length > 0 ? (
                                <div className="mt-2">
                                    <EChart option={spendBarOption} height={300} />
                                </div>
                            ) : null}
                            <DataTable
                                className="mt-2"
                                columns={[
                                    { header: 'Supplier', accessorKey: 'name' },
                                    { header: 'Code', accessorKey: 'code' },
                                    {
                                        header: 'Amount',
                                        cell: ({ row }: any) => fmt(row.original.amount),
                                    },
                                ]}
                                data={spendBySupplier}
                            />
                        </>
                    )}

                    {analyticsTab === 'suppliers' && (
                        <>
                            <Link
                                className="text-sm font-medium text-primary"
                                href="/modules/mm/supplier-management/supplier-performance"
                            >
                                Supplier performance →
                            </Link>
                            <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <h6 className="mb-2 text-sm font-semibold heading-text">Top</h6>
                                    <DataTable
                                        columns={[
                                            { header: 'Supplier', accessorKey: 'supplierName' },
                                            {
                                                header: 'Score',
                                                cell: ({ row }: any) => (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">
                                                            {fmt(Number(row.original.overallScore), 1)}
                                                        </span>
                                                        <GrowShrinkValue
                                                            value={Number(
                                                                (
                                                                    Number(row.original.overallScore) -
                                                                    50
                                                                ).toFixed(1),
                                                            )}
                                                            suffix="%"
                                                            className="text-xs"
                                                        />
                                                    </div>
                                                ),
                                            },
                                        ]}
                                        data={topSuppliers}
                                    />
                                </div>
                                <div>
                                    <h6 className="mb-2 text-sm font-semibold heading-text">Bottom</h6>
                                    <DataTable
                                        columns={[
                                            { header: 'Supplier', accessorKey: 'supplierName' },
                                            { header: 'Score', accessorKey: 'overallScore' },
                                        ]}
                                        data={dash?.analytics?.suppliers?.bottom ?? []}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </AdaptiveCard>
        </>
    )
}
