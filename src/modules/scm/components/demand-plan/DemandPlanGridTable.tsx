'use client'

import { useMemo } from 'react'
import { HiOutlineLockClosed } from 'react-icons/hi'
import Input from '@/components/ui/Input'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import type { DemandPlanGrid, DemandPlanGridRow } from '../../types'
import { computeDelta, deltaToneClass, formatDelta } from '../../utils/demandDelta'

type GridRow = DemandPlanGridRow & { isTotal?: boolean }

type Props = {
    grid: DemandPlanGrid | null
    loading: boolean
    /** Pending overrides keyed by base-grain lineId (string input values). */
    edits: Record<string, string>
    onEdit: (lineId: string, value: string, currentQty: number) => void
}

const fmt = (n: number) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

function CompareDelta({ qty, compareQty }: { qty: number; compareQty?: number | null }) {
    const d = computeDelta(qty, compareQty)
    if (!d || d.direction === 'flat') return null
    return (
        <span
            className={`block whitespace-nowrap text-[10px] ${deltaToneClass(d)}`}
            title={`vs comparison ${fmt(compareQty ?? 0)}: ${formatDelta(d)}`}
        >
            {formatDelta(d, '')}
        </span>
    )
}

export default function DemandPlanGridTable({
    grid,
    loading,
    edits,
    onEdit,
}: Props) {
    const columns = useMemo<ColumnDef<GridRow>[]>(() => {
        if (!grid) return []
        const { scope, periods, totals } = grid
        const productHeader = scope.granularity === 'SKU' ? 'Product' : 'Family'

        const cols: ColumnDef<GridRow>[] = [
            {
                header: productHeader,
                id: 'product',
                size: 170,
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
                        : (grid.locationNames?.[row.original.locationCode] ??
                          row.original.locationCode),
            },
            {
                header: 'History',
                id: 'history',
                size: 90,
                cell: ({ row }) =>
                    row.original.historyQty == null ? (
                        <span className="text-gray-300">—</span>
                    ) : (
                        <span
                            className={
                                row.original.isTotal
                                    ? 'font-semibold text-gray-500'
                                    : 'text-gray-500'
                            }
                            title="Past sales over the prior window of the same length"
                        >
                            {fmt(row.original.historyQty)}
                        </span>
                    ),
            },
        ]

        for (const p of periods) {
            cols.push({
                id: p.key,
                size: 96,
                header: () => (
                    <div
                        className="whitespace-nowrap text-right"
                        title={p.frozen ? 'Inside freeze fence' : undefined}
                    >
                        {p.frozen ? (
                            <HiOutlineLockClosed className="mr-1 inline text-amber-500" />
                        ) : null}
                        {p.label}
                    </div>
                ),
                cell: ({ row }) => {
                    const r = row.original
                    if (r.isTotal) {
                        return (
                            <div className="text-right font-semibold">
                                {fmt(totals[p.key] ?? 0)}
                            </div>
                        )
                    }
                    const c = r.cells[p.key]
                    if (!c) {
                        return <div className="text-right text-gray-300">—</div>
                    }
                    const editable = scope.editable && !p.frozen && c.lineId
                    if (editable && c.lineId) {
                        const lineId = c.lineId
                        const pending = edits[lineId]
                        return (
                            <div className="min-w-[5.5rem]">
                                <Input
                                    size="sm"
                                    type="number"
                                    min={0}
                                    className={
                                        pending !== undefined
                                            ? 'text-right ring-1 ring-primary'
                                            : c.adjusted
                                              ? 'text-right bg-amber-50 dark:bg-amber-500/10'
                                              : 'text-right'
                                    }
                                    value={pending ?? String(Math.round(c.qty))}
                                    title={`System ${fmt(c.systemQty)}${c.adjusted ? ' · overridden' : ''}`}
                                    onChange={(e) =>
                                        onEdit(lineId, e.target.value, c.qty)
                                    }
                                />
                                {c.adjusted ? (
                                    <span className="block text-[10px] text-gray-400">
                                        sys {fmt(c.systemQty)}
                                    </span>
                                ) : null}
                                <CompareDelta qty={c.qty} compareQty={c.compareQty} />
                            </div>
                        )
                    }
                    return (
                        <div
                            className={
                                p.frozen
                                    ? 'text-right text-gray-500'
                                    : 'text-right'
                            }
                            title={`System ${fmt(c.systemQty)}`}
                        >
                            {fmt(c.qty)}
                            {c.adjusted ? (
                                <span className="ml-0.5 text-amber-500">•</span>
                            ) : null}
                            <CompareDelta qty={c.qty} compareQty={c.compareQty} />
                        </div>
                    )
                },
            })
        }

        const systemGrand = grid.rows.reduce((s, r) => s + r.systemTotal, 0)
        const systemOf = (r: GridRow) => (r.isTotal ? systemGrand : r.systemTotal)
        const finalOf = (r: GridRow) => (r.isTotal ? grid.grandTotal : r.total)
        cols.push(
            {
                header: () => (
                    <div className="text-right" title="System forecast (generated baseline)">
                        System
                    </div>
                ),
                id: 'system',
                size: 100,
                cell: ({ row }) => (
                    <div className="text-right text-gray-500">
                        {fmt(systemOf(row.original))}
                    </div>
                ),
            },
            {
                header: () => (
                    <div className="text-right" title="Planner adjustment (final − system)">
                        Adj.
                    </div>
                ),
                id: 'adjustment',
                size: 110,
                cell: ({ row }) => {
                    const d = computeDelta(finalOf(row.original), systemOf(row.original))
                    return (
                        <div className="text-right text-xs">
                            {d && d.direction !== 'flat' ? (
                                <span className={`whitespace-nowrap ${deltaToneClass(d)}`}>
                                    {formatDelta(d, '')}
                                </span>
                            ) : (
                                <span className="text-gray-300">—</span>
                            )}
                        </div>
                    )
                },
            },
            {
                header: () => <div className="text-right">Final</div>,
                id: 'total',
                size: 100,
                cell: ({ row }) => (
                    <div className="text-right font-semibold">
                        {fmt(finalOf(row.original))}
                    </div>
                ),
            },
        )
        return cols
    }, [grid, edits, onEdit])

    const data = useMemo<GridRow[]>(() => {
        if (!grid || grid.rows.length === 0) return []
        return [
            ...grid.rows,
            {
                rowKey: '__total',
                productKey: 'Total',
                family: null,
                locationCode: '',
                cells: {},
                total: grid.grandTotal,
                systemTotal: 0,
                historyQty: grid.rows.some((r) => r.historyQty != null)
                    ? grid.rows.reduce((s, r) => s + (r.historyQty ?? 0), 0)
                    : null,
                isTotal: true,
            },
        ]
    }, [grid])

    return (
        <div className="overflow-x-auto">
            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                noData={!loading && data.length === 0}
                hidePagination
                pagingData={{
                    total: data.length,
                    pageIndex: 1,
                    pageSize: Math.max(data.length, 10),
                }}
            />
        </div>
    )
}
