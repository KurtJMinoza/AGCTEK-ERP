'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineRefresh } from 'react-icons/hi'
import { exceptionCenterService } from '../services/exceptionCenterService'
import type { MmExceptionItem } from '../types'
import {
    ExceptionActionCell,
    ExceptionAgeCell,
    ExceptionDocumentCell,
    ExceptionDomainChip,
    ExceptionIssueCell,
    ExceptionOwnerCell,
    ExceptionSeverityCell,
    excTableRowClass,
} from '../components/ExceptionTableCells'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
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

const ExceptionCenterPage = () => {
    const searchParams = useSearchParams()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
    )
    const [companyId, setCompanyId] = useState('')
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
    }, [loadFilterRefs])

    useEffect(() => {
        if (!companyId && companies.length) setCompanyId(companies[0].value)
    }, [companies, companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await exceptionCenterService.list({
                companyId,
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
    }, [companyId, warehouseId, severity, domain, dateFrom, dateTo, includeStale])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MmExceptionItem>[] = useMemo(
        () => [
            {
                header: 'Exception',
                id: 'issue',
                size: 260,
                minSize: 200,
                cell: ({ row }) => <ExceptionIssueCell item={row.original} />,
            },
            {
                header: 'Severity',
                accessorKey: 'severity',
                size: 108,
                minSize: 92,
                cell: ({ row }) => (
                    <ExceptionSeverityCell severity={row.original.severity} />
                ),
            },
            {
                header: 'Domain',
                accessorKey: 'domain',
                size: 120,
                minSize: 100,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => (
                    <ExceptionDomainChip domain={row.original.domain} />
                ),
            },
            {
                header: 'Document',
                id: 'document',
                size: 132,
                minSize: 110,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <ExceptionDocumentCell document={row.original.document} />
                ),
            },
            {
                header: 'Age',
                id: 'age',
                size: 88,
                minSize: 72,
                cell: ({ row }) => (
                    <ExceptionAgeCell
                        ageHours={row.original.ageHours}
                        stale={row.original.stale}
                    />
                ),
            },
            {
                header: 'Owner',
                id: 'owner',
                size: 140,
                minSize: 120,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) => (
                    <ExceptionOwnerCell owner={row.original.owner} />
                ),
            },
            {
                header: 'Resolve',
                id: 'action',
                size: 148,
                minSize: 120,
                cell: ({ row }) => (
                    <ExceptionActionCell
                        href={row.original.href}
                        recommendedAction={row.original.recommendedAction}
                    />
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
                    fit
                    getRowId={(row) => row.id}
                    rowClassName={(row, index) => excTableRowClass(row, index)}
                    noData={!loading && rows.length === 0}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ExceptionCenterPage
