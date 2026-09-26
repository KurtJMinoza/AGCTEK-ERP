'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineRefresh, HiOutlineExternalLink } from 'react-icons/hi'
import { exceptionCenterService } from '../services/exceptionCenterService'
import type { MmExceptionItem, MmExceptionSeverity } from '../types'
import { useDeferredFilterRefs, useLazyOrgRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/exception-center'
type Opt = { value: string; label: string }

const SEVERITY_OPTS: Opt[] = [
    { value: '', label: 'All severities' },
    { value: 'CRITICAL', label: 'Critical' },
    { value: 'HIGH', label: 'High' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'LOW', label: 'Low' },
]

const DOMAIN_OPTS: Opt[] = [
    { value: '', label: 'All domains' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'receiving', label: 'Receiving' },
    { value: 'quality', label: 'Quality' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'inventory_control', label: 'Inventory Control' },
    { value: 'transfers', label: 'Transfers' },
    { value: 'mrp', label: 'MRP' },
    { value: 'integration', label: 'Integration' },
]

const SEVERITY_TONE: Record<MmExceptionSeverity, 'danger' | 'warning' | 'info' | 'default'> = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'default',
}

function fmtAge(hours: number) {
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

const ExceptionCenterPage = () => {
    const searchParams = useSearchParams()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
    )
    const { plants, ensure: ensureOrgRefs } = useLazyOrgRefs()

    const [companyId, setCompanyId] = useState('')
    const [plantId, setPlantId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [severity, setSeverity] = useState('')
    const [domain, setDomain] = useState(searchParams.get('domain') ?? '')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [includeStale, setIncludeStale] = useState(false)
    const [rows, setRows] = useState<MmExceptionItem[]>([])
    const [counts, setCounts] = useState({
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
    })
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        loadFilterRefs()
        void ensureOrgRefs('plants')
    }, [loadFilterRefs, ensureOrgRefs])

    useEffect(() => {
        if (!companyId && companies.length) setCompanyId(companies[0].value)
    }, [companies, companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await exceptionCenterService.list({
                companyId,
                plantId: plantId || undefined,
                warehouseId: warehouseId || undefined,
                severity: severity || undefined,
                domain: domain || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                includeStale,
                limit: 100,
            })
            setRows(res.data)
            setCounts(res.meta.counts.bySeverity)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } }
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {err?.response?.data?.message || 'Failed to load exceptions'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [companyId, plantId, warehouseId, severity, domain, dateFrom, dateTo, includeStale])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MmExceptionItem>[] = useMemo(
        () => [
            {
                header: 'Severity',
                cell: ({ row }) => (
                    <StatusBadge tone={SEVERITY_TONE[row.original.severity]}>
                        {row.original.severity}
                    </StatusBadge>
                ),
            },
            { header: 'Type', accessorKey: 'type' },
            { header: 'Domain', accessorKey: 'domain' },
            { header: 'Title', accessorKey: 'title' },
            {
                header: 'Document',
                cell: ({ row }) =>
                    row.original.document?.number ?? row.original.document?.id ?? '—',
            },
            {
                header: 'Age',
                cell: ({ row }) => (
                    <span className={row.original.stale ? 'text-amber-600' : undefined}>
                        {fmtAge(row.original.ageHours)}
                        {row.original.stale ? ' (stale)' : ''}
                    </span>
                ),
            },
            {
                header: 'Owner',
                cell: ({ row }) => row.original.owner ?? '—',
            },
            {
                header: 'Action',
                cell: ({ row }) => (
                    <Link
                        href={row.original.href}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                        {row.original.recommendedAction.slice(0, 40)}
                        <HiOutlineExternalLink className="text-sm" />
                    </Link>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Exception Center"
                description="Read-only operational exceptions aggregated from MM domains. Fix actions open the owning module."
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Critical" value={counts.CRITICAL} tone="danger" />
                <StatCard label="High" value={counts.HIGH} tone="warning" />
                <StatCard label="Medium" value={counts.MEDIUM} tone="info" />
                <StatCard label="Low" value={counts.LOW} tone="default" />
            </div>

            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((c) => c.value === companyId) ?? null}
                            onChange={(o) => setCompanyId((o as Opt)?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Plant">
                        <Select
                            isClearable
                            options={plants}
                            value={plants.find((p) => p.value === plantId) ?? null}
                            onChange={(o) => setPlantId((o as Opt)?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find((w) => w.value === warehouseId) ?? null
                            }
                            onChange={(o) => setWarehouseId((o as Opt)?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Severity">
                        <Select
                            options={SEVERITY_OPTS}
                            value={
                                SEVERITY_OPTS.find((o) => o.value === severity) ?? SEVERITY_OPTS[0]
                            }
                            onChange={(o) => setSeverity((o as Opt)?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Domain">
                        <Select
                            options={DOMAIN_OPTS}
                            value={
                                DOMAIN_OPTS.find((o) => o.value === domain) ?? DOMAIN_OPTS[0]
                            }
                            onChange={(o) => setDomain((o as Opt)?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="From">
                        <input
                            type="date"
                            className="input input-sm w-full"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="To">
                        <input
                            type="date"
                            className="input input-sm w-full"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Options">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={includeStale}
                                onChange={(e) => setIncludeStale(e.target.checked)}
                            />
                            Include stale (&gt;90d)
                        </label>
                    </FormItem>
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    compact
                    fit
                    noData={!loading && rows.length === 0}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ExceptionCenterPage
