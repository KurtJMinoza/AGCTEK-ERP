'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import {
    buildBarOption,
    buildDonutOption,
    buildMovementComboOption,
} from '@/components/shared/EChart'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineRefresh } from 'react-icons/hi'
import { dashboardService } from '../services/dashboardService'
import { orgService, materialCategoryService } from '../../material-master/services/referenceService'
import { supplierService } from '../../supplier-management/services/supplierService'
import type { MmDashboard } from '../types'
import { DashboardAnalyticsTab } from '../components/DashboardAnalyticsTab'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/dashboard'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function fmt(n: number, digits = 2) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits })
}

const OverviewPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [suppliers, setSuppliers] = useState<Opt[]>([])
    const [categories, setCategories] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [branchId, setBranchId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [chartFocus, setChartFocus] = useState<'all' | 'inbound' | 'outbound'>('all')
    const [analyticsTab, setAnalyticsTab] = useState('aging')
    const [dash, setDash] = useState<MmDashboard | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        orgService.companies().then((cos: any) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map((x: any) => ({
                value: x.id,
                label: x.name || x.code,
            }))
            setCompanies(c)
            if (c[0]) setCompanyId(c[0].value)
        })
        materialCategoryService
            .list()
            .then((rows: any) => {
                const list = Array.isArray(rows) ? rows : rows?.data ?? []
                setCategories(list.map((x: any) => ({ value: x.id, label: x.name || x.code })))
            })
            .catch(() => {})
        // Thin option lists for filters (cached via orgService)
        orgService
            .warehouses()
            .then((list: any) => {
                const rows = Array.isArray(list) ? list : list?.data ?? []
                setWarehouses(
                    rows
                        .slice(0, 100)
                        .map((w: any) => ({
                            value: w.id,
                            label: `${w.code} — ${w.name}`,
                        })),
                )
            })
            .catch(() => {})
        supplierService
            .list({ pageSize: 100, status: 'ACTIVE' } as any)
            .then((r: any) => {
                const list = Array.isArray(r) ? r : r?.data ?? []
                setSuppliers(
                    list.slice(0, 100).map((s: any) => ({
                        value: s.id,
                        label: `${s.supplierCode} — ${s.supplierName}`,
                    })),
                )
            })
            .catch(() => {})
    }, [])

    const params = useMemo(
        () => ({
            companyId,
            warehouseId: warehouseId || undefined,
            branchId: branchId || undefined,
            materialCategoryId: categoryId || undefined,
            supplierId: supplierId || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
        }),
        [companyId, warehouseId, branchId, categoryId, supplierId, dateFrom, dateTo],
    )

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            // Phase 1: KPIs + alerts only (~fast)
            const lite = await dashboardService.get({
                ...params,
                includeAnalytics: false,
            } as any)
            setDash(lite)
            setLoading(false)
            // Phase 2: heavy analytics in background
            const full = await dashboardService.get({
                ...params,
                includeAnalytics: true,
            } as any)
            setDash(full)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Failed to load dashboard')
            setLoading(false)
        }
    }, [companyId, params])

    useEffect(() => {
        load()
    }, [load])

    const refresh = useCallback(async () => {
        if (!companyId) return
        try {
            await dashboardService.refresh(params)
            await load()
            pushToast('success', 'Refreshed', 'Analytics cache recomputed')
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Refresh failed')
        }
    }, [companyId, params, load])

    const movementSeries = dash?.analytics?.movement?.series ?? []
    const agingBuckets = dash?.analytics?.aging?.buckets ?? []
    const spendBySupplier = dash?.analytics?.spend?.bySupplier ?? []

    const inbound = movementSeries.map((s: any) => Number(s.inbound ?? 0))
    const outbound = movementSeries.map((s: any) => Number(s.outbound ?? 0))
    const chartCategories = movementSeries.map((s: any) =>
        new Date(s.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
    )

    const agingTotal = agingBuckets.reduce((s: number, b: any) => s + Number(b.quantity ?? 0), 0)
    const agingDonut = agingBuckets.map((b: any) => Number(b.quantity ?? 0))
    const agingLabels = agingBuckets.map((b: any) => String(b.name ?? b.bucket ?? ''))

    const movementOption = useMemo(
        () =>
            buildMovementComboOption({
                categories: chartCategories,
                inbound,
                outbound,
                focus: chartFocus,
            }),
        [chartCategories, inbound, outbound, chartFocus],
    )

    const agingDonutOption = useMemo(
        () =>
            buildDonutOption({
                labels: agingLabels,
                values: agingDonut,
                title: 'Total',
                centerText: fmt(agingTotal, 0),
                showLegend: false,
            }),
        [agingLabels, agingDonut, agingTotal],
    )

    const agingBarOption = useMemo(
        () =>
            buildBarOption({
                categories: agingBuckets.map((b: any) => String(b.name)),
                series: [
                    {
                        name: 'Quantity',
                        data: agingBuckets.map((b: any) => Number(b.quantity ?? 0)),
                    },
                ],
            }),
        [agingBuckets],
    )

    const spendBarOption = useMemo(
        () =>
            buildBarOption({
                categories: spendBySupplier
                    .slice(0, 8)
                    .map((r: any) => String(r.name || r.code || '—')),
                series: [
                    {
                        name: 'Spend',
                        data: spendBySupplier.slice(0, 8).map((r: any) => Number(r.amount ?? 0)),
                    },
                ],
                horizontal: true,
            }),
        [spendBySupplier],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Analytics Dashboard"
                description="Charts and reports across Materials Management"
                actions={
                    <div className="flex gap-2">
                        <Button icon={<HiOutlineRefresh />} loading={loading} onClick={load}>
                            Refresh
                        </Button>
                        <Button variant="solid" onClick={refresh}>
                            Recompute analytics
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    <FormItem label="Company" className="mb-0">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Warehouse" className="mb-0">
                        <Select
                            isClearable
                            options={warehouses}
                            value={warehouses.find((o) => o.value === warehouseId) || null}
                            onChange={(o: any) => setWarehouseId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Branch ID" className="mb-0">
                        <Input
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            placeholder="Optional"
                        />
                    </FormItem>
                    <FormItem label="Category" className="mb-0">
                        <Select
                            isClearable
                            options={categories}
                            value={categories.find((o) => o.value === categoryId) || null}
                            onChange={(o: any) => setCategoryId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Supplier" className="mb-0">
                        <Select
                            isClearable
                            options={suppliers}
                            value={suppliers.find((o) => o.value === supplierId) || null}
                            onChange={(o: any) => setSupplierId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="From" className="mb-0">
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </FormItem>
                    <FormItem label="To" className="mb-0">
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </FormItem>
                </div>
            </AdaptiveCard>

            <DashboardAnalyticsTab
                dash={dash}
                loading={loading && !dash}
                chartFocus={chartFocus}
                onChartFocusChange={setChartFocus}
                analyticsTab={analyticsTab}
                onAnalyticsTabChange={setAnalyticsTab}
                movementOption={movementOption}
                agingDonutOption={agingDonutOption}
                agingBarOption={agingBarOption}
                spendBarOption={spendBarOption}
            />
        </PageContainer>
    )
}

export default OverviewPage
