'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Chart from '@/components/shared/Chart'
import Select from '@/components/ui/Select'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { supplierPerformanceService } from '../services/supplierPerformanceService'
import { orgService } from '../../material-master/services/referenceService'
import type { PerformanceDashboard, SupplierEvaluation } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/supplier-management/supplier-performance'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const SupplierPerformancePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [dash, setDash] = useState<PerformanceDashboard | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        orgService.companies().then((cos: any) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const d = await supplierPerformanceService.dashboard({ companyId })
            setDash(d)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const s = dash?.summary
    const columns: ColumnDef<SupplierEvaluation>[] = useMemo(
        () => [
            {
                header: 'Supplier',
                cell: ({ row }) => (
                    <Link
                        className="text-primary hover:underline"
                        href={`/modules/mm/supplier-management/supplier-master/${row.original.supplierId}`}
                    >
                        {row.original.supplier?.supplierCode ?? '—'}
                    </Link>
                ),
            },
            {
                header: 'Name',
                cell: ({ row }) => row.original.supplier?.supplierName ?? '—',
            },
            {
                header: 'Score',
                cell: ({ row }) => (
                    <span className="font-semibold">
                        {Number(row.original.overallScore).toFixed(1)}
                    </span>
                ),
            },
            {
                header: 'Delivery',
                cell: ({ row }) => Number(row.original.deliveryScore).toFixed(1),
            },
            {
                header: 'Quality',
                cell: ({ row }) => Number(row.original.qualityScore).toFixed(1),
            },
            {
                header: 'Returns %',
                cell: ({ row }) =>
                    `${(Number(row.original.returnRate) * 100).toFixed(1)}%`,
            },
            {
                header: 'Price',
                cell: ({ row }) => Number(row.original.priceScore).toFixed(1),
            },
            {
                header: 'Volume',
                cell: ({ row }) =>
                    Number(row.original.purchaseVolume).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                    }),
            },
        ],
        [],
    )

    const chartSeries = useMemo(() => {
        const trend = dash?.trend ?? []
        return [
            {
                name: 'Overall',
                data: trend.map((t) => Number(t.overallScore.toFixed(1))),
            },
            {
                name: 'Delivery',
                data: trend.map((t) => Number(t.deliveryScore.toFixed(1))),
            },
            {
                name: 'Quality',
                data: trend.map((t) => Number(t.qualityScore.toFixed(1))),
            },
        ]
    }, [dash])

    const chartCategories = useMemo(
        () =>
            (dash?.trend ?? []).map((t) =>
                String(t.periodStart).slice(0, 7),
            ),
        [dash],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Performance"
                description="Score ranking, delivery/quality/returns/price, purchase volume, and trend"
                actions={
                    <Link href="/modules/mm/supplier-management/supplier-evaluation">
                        <Button>Run / Configure</Button>
                    </Link>
                }
            />

            <AdaptiveCard className="mb-4">
                <FormItem label="Company">
                    <Select
                        options={companies}
                        value={companies.find((o) => o.value === companyId)}
                        onChange={(o: any) => setCompanyId(o?.value || '')}
                    />
                </FormItem>
            </AdaptiveCard>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                {[
                    {
                        label: 'Avg score',
                        value: (s?.avgOverallScore ?? 0).toFixed(1),
                    },
                    {
                        label: 'Delivery',
                        value: (s?.avgDelivery ?? 0).toFixed(1),
                    },
                    {
                        label: 'Quality',
                        value: (s?.avgQuality ?? 0).toFixed(1),
                    },
                    {
                        label: 'Return rate',
                        value: `${((s?.avgReturnRate ?? 0) * 100).toFixed(1)}%`,
                    },
                    {
                        label: 'Price score',
                        value: (s?.avgPriceScore ?? 0).toFixed(1),
                    },
                    {
                        label: 'Volume',
                        value: (s?.totalPurchaseVolume ?? 0).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 0 },
                        ),
                    },
                    { label: 'Open alerts', value: s?.openAlerts ?? 0 },
                ].map((c) => (
                    <Card key={c.label} className="p-4">
                        <div className="text-xs text-gray-500">{c.label}</div>
                        <div className="text-xl font-semibold">{c.value}</div>
                    </Card>
                ))}
            </div>

            <AdaptiveCard className="mb-4">
                <h5 className="mb-3 font-semibold">Score trend</h5>
                {chartCategories.length ? (
                    <Chart
                        type="line"
                        series={chartSeries}
                        xAxis={chartCategories}
                        height={280}
                    />
                ) : (
                    <p className="text-sm text-gray-500">
                        No evaluation history yet. Run an evaluation to populate trends.
                    </p>
                )}
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={dash?.rankings ?? []}
                    loading={loading}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SupplierPerformancePage
