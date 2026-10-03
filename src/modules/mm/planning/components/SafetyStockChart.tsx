'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Chart from '@/components/shared/Chart'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MaterialRequirement } from '../types'

const TOP_N = 12
const MM_SAFETY_STOCK_ROUTE = '/modules/mm/planning-mrp/safety-stock'

function toNumber(v: string | number | undefined | null): number {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}

function materialLabel(row: MaterialRequirement): string {
    return row.material?.materialCode ?? row.materialId.slice(0, 8)
}

/** Same filter as MM Safety Stock page — MRP snapshot rows with safety context. */
export function filterSafetyStockRows(
    rows: MaterialRequirement[],
): MaterialRequirement[] {
    return rows.filter(
        (r) =>
            toNumber(r.safetyStock) > 0 ||
            toNumber(r.availableQty) < toNumber(r.safetyStock),
    )
}

type Props = {
    /** When set, hide company/warehouse filters (parent owns scope). */
    companyId?: string
    warehouseId?: string
    /** Compact mode for embedding (e.g. SCM Demand Planning). */
    compact?: boolean
    className?: string
    topN?: number
}

/**
 * Read-only Safety Stock chart from the latest completed MRP material-requirements
 * snapshot. Owns no planning math — displays MM Planning API results only.
 */
export default function SafetyStockChart({
    companyId: companyIdProp,
    warehouseId: warehouseIdProp,
    compact = false,
    className,
    topN = TOP_N,
}: Props) {
    const scoped = Boolean(companyIdProp)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
    )
    const [companyId, setCompanyId] = useState(companyIdProp ?? '')
    const [warehouseId, setWarehouseId] = useState(warehouseIdProp ?? '')
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (companyIdProp) setCompanyId(companyIdProp)
    }, [companyIdProp])

    useEffect(() => {
        if (warehouseIdProp !== undefined) setWarehouseId(warehouseIdProp)
    }, [warehouseIdProp])

    useEffect(() => {
        if (!scoped && !companyId && companies[0]) {
            setCompanyId(companies[0].value)
        }
    }, [scoped, companies, companyId])

    useEffect(() => {
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [loadFilterRefs])

    const load = useCallback(async () => {
        if (!companyId) {
            setRows([])
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const res = await planningService.listRequirements({
                companyId,
                warehouseId: warehouseId || undefined,
                limit: 200,
            })
            setRows(filterSafetyStockRows(res.data ?? []))
        } catch (e: unknown) {
            const msg =
                e && typeof e === 'object' && 'response' in e
                    ? String(
                          (e as { response?: { data?: { message?: string } } })
                              .response?.data?.message ?? 'Load failed',
                      )
                    : e instanceof Error
                      ? e.message
                      : 'Load failed'
            setError(msg)
            setRows([])
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        void load()
    }, [load])

    const safetyRows = useMemo(() => {
        return [...rows]
            .sort((a, b) => {
                const gapA = Math.max(
                    0,
                    toNumber(a.safetyStock) - toNumber(a.availableQty),
                )
                const gapB = Math.max(
                    0,
                    toNumber(b.safetyStock) - toNumber(b.availableQty),
                )
                if (gapB !== gapA) return gapB - gapA
                return toNumber(b.safetyStock) - toNumber(a.safetyStock)
            })
            .slice(0, topN)
    }, [rows, topN])

    const belowCount = useMemo(
        () =>
            rows.filter(
                (r) => toNumber(r.availableQty) < toNumber(r.safetyStock),
            ).length,
        [rows],
    )

    const chart = useMemo(() => {
        const ordered = [...safetyRows].reverse()
        return {
            labels: ordered.map(materialLabel),
            available: ordered.map(
                (r) => Math.round(toNumber(r.availableQty) * 100) / 100,
            ),
            safety: ordered.map(
                (r) => Math.round(toNumber(r.safetyStock) * 100) / 100,
            ),
            runLabel: safetyRows[0]?.mrpRun?.runNumber ?? null,
        }
    }, [safetyRows])

    return (
        <AdaptiveCard className={className}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h5 className="mb-0.5">Safety Stock</h5>
                    <p className="text-sm text-gray-500">
                        Available vs safety stock from the latest MRP snapshot
                        {chart.runLabel ? ` (${chart.runLabel})` : ''}.
                        {belowCount > 0
                            ? ` ${belowCount} below safety.`
                            : rows.length > 0
                              ? ' All shown materials at or above safety.'
                              : ''}
                    </p>
                </div>
                {compact ? (
                    <Link href={MM_SAFETY_STOCK_ROUTE}>
                        <Button size="xs">Open in MM</Button>
                    </Link>
                ) : null}
            </div>

            {!scoped ? (
                <div
                    className={
                        compact
                            ? 'mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2'
                            : 'mb-4 grid grid-cols-1 gap-4 md:grid-cols-2'
                    }
                >
                    <FormItem label="Company" className="mb-0">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: { value?: string } | null) =>
                                setCompanyId(o?.value || '')
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse" className="mb-0">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find(
                                    (o) => o.value === warehouseId,
                                ) || null
                            }
                            onChange={(o: { value?: string } | null) =>
                                setWarehouseId(o?.value || '')
                            }
                        />
                    </FormItem>
                </div>
            ) : null}

            {loading ? (
                <p className="py-12 text-center text-sm text-gray-500">
                    Loading MRP safety stock…
                </p>
            ) : error ? (
                <p className="py-8 text-center text-sm text-red-500">{error}</p>
            ) : !companyId ? (
                <p className="rounded-md border border-dashed border-gray-200 px-3 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                    Select a company to load the MRP safety stock snapshot.
                </p>
            ) : safetyRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-gray-200 px-3 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                    No safety-stock rows in the latest completed MRP run. Run
                    MRP in MM Planning first.
                </p>
            ) : (
                <Chart
                    type="bar"
                    height={compact ? 280 : 320}
                    xAxis={chart.labels}
                    series={[
                        { name: 'Available', data: chart.available },
                        { name: 'Safety stock', data: chart.safety },
                    ]}
                    customOptions={{
                        chart: { stacked: false },
                        plotOptions: {
                            bar: {
                                horizontal: true,
                                borderRadius: 4,
                                barHeight: '68%',
                            },
                        },
                        dataLabels: { enabled: false },
                        xaxis: {
                            categories: chart.labels,
                            labels: {
                                formatter: (v: string) => {
                                    const n = Number(v)
                                    return Number.isFinite(n)
                                        ? n.toLocaleString()
                                        : String(v)
                                },
                            },
                        },
                        yaxis: {
                            labels: {
                                maxWidth: 110,
                            },
                        },
                        tooltip: {
                            y: {
                                formatter: (v: number) =>
                                    `${Number(v).toLocaleString()} qty`,
                            },
                        },
                        legend: { position: 'top' },
                        colors: ['#3b82f6', '#f59e0b'],
                    }}
                />
            )}
        </AdaptiveCard>
    )
}
