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
import { HiOutlineFilter, HiOutlineRefresh, HiOutlineX } from 'react-icons/hi'
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
    { value: 'returns_disposal', label: 'Returns & Disposal' },
    { value: 'supporting_ops', label: 'Supporting Ops' },
]

const PAGE_SIZES = [10, 20, 50, 100]

const ExceptionCenterPage = () => {
    const searchParams = useSearchParams()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
    )
    const requestedDomain = searchParams.get('domain') ?? ''
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [severity, setSeverity] = useState('')
    const [domain, setDomain] = useState(
        DOMAIN_OPTS.some((o) => o.value === requestedDomain)
            ? requestedDomain
            : '',
    )
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [includeStale, setIncludeStale] = useState(false)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<MmExceptionItem[]>([])
    const [total, setTotal] = useState(0)
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
                page,
                limit: pageSize,
            })
            setRows(res.data)
            setTotal(res.meta.total)
            setCounts(res.meta.counts.bySeverity)
            if (res.meta.totalPages > 0 && page > res.meta.totalPages) {
                setPage(res.meta.totalPages)
            }
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } }
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {err?.response?.data?.message ||
                        'Failed to load exceptions'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [
        companyId,
        warehouseId,
        severity,
        domain,
        dateFrom,
        dateTo,
        includeStale,
        page,
        pageSize,
    ])

    useEffect(() => {
        load()
    }, [load])

    const activeFilterCount = useMemo(
        () =>
            [
                warehouseId,
                severity,
                domain,
                dateFrom,
                dateTo,
                includeStale ? 'stale' : '',
            ].filter(Boolean).length,
        [warehouseId, severity, domain, dateFrom, dateTo, includeStale],
    )

    const resetPage = useCallback(() => setPage(1), [])

    const clearFilters = useCallback(() => {
        setWarehouseId('')
        setSeverity('')
        setDomain('')
        setDateFrom('')
        setDateTo('')
        setIncludeStale(false)
        setPage(1)
    }, [])

    const columns: ColumnDef<MmExceptionItem>[] = useMemo(
        () => [
            {
                header: 'Exception',
                id: 'issue',
                size: 360,
                minSize: 240,
                cell: ({ row }) => <ExceptionIssueCell item={row.original} />,
            },
            {
                header: 'Severity',
                accessorKey: 'severity',
                size: 104,
                minSize: 92,
                meta: { className: 'hidden @md:table-cell' },
                cell: ({ row }) => (
                    <ExceptionSeverityCell severity={row.original.severity} />
                ),
            },
            {
                header: 'Age',
                id: 'age',
                size: 92,
                minSize: 76,
                meta: { className: 'hidden @xl:table-cell' },
                cell: ({ row }) => (
                    <ExceptionAgeCell
                        ageHours={row.original.ageHours}
                        stale={row.original.stale}
                    />
                ),
            },
            {
                header: 'Domain',
                accessorKey: 'domain',
                size: 122,
                minSize: 104,
                meta: { className: 'hidden @3xl:table-cell' },
                cell: ({ row }) => (
                    <ExceptionDomainChip domain={row.original.domain} />
                ),
            },
            {
                header: 'Document',
                id: 'document',
                size: 138,
                minSize: 116,
                meta: { className: 'hidden @4xl:table-cell' },
                cell: ({ row }) => (
                    <ExceptionDocumentCell document={row.original.document} />
                ),
            },
            {
                header: 'Owner',
                id: 'owner',
                size: 148,
                minSize: 124,
                meta: { className: 'hidden @5xl:table-cell' },
                cell: ({ row }) => (
                    <ExceptionOwnerCell owner={row.original.owner} />
                ),
            },
            {
                header: () => <span className="hidden @md:inline">Resolve</span>,
                id: 'action',
                size: 96,
                minSize: 48,
                enableSorting: false,
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

    const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
    const rangeEnd = Math.min(page * pageSize, total)

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
                <StatCard
                    label="Critical"
                    value={counts.CRITICAL}
                    tone="danger"
                />
                <StatCard label="High" value={counts.HIGH} tone="warning" />
                <StatCard label="Medium" value={counts.MEDIUM} tone="info" />
                <StatCard label="Low" value={counts.LOW} tone="default" />
            </div>

            <AdaptiveCard className="mb-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle text-primary dark:bg-primary/15 dark:text-primary-light">
                            <HiOutlineFilter className="text-sm" />
                        </span>
                        <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
                            Filters
                        </span>
                        {activeFilterCount > 0 ? (
                            <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-bold text-primary dark:bg-primary/15 dark:text-primary-light">
                                {activeFilterCount} active
                            </span>
                        ) : null}
                    </div>
                    {activeFilterCount > 0 ? (
                        <Button
                            size="xs"
                            icon={<HiOutlineX />}
                            onClick={clearFilters}
                        >
                            Reset filters
                        </Button>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={
                                companies.find((c) => c.value === companyId) ??
                                null
                            }
                            onChange={(o) => {
                                setCompanyId((o as Opt)?.value ?? '')
                                resetPage()
                            }}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find(
                                    (w) => w.value === warehouseId,
                                ) ?? null
                            }
                            onChange={(o) => {
                                setWarehouseId((o as Opt)?.value ?? '')
                                resetPage()
                            }}
                        />
                    </FormItem>
                    <FormItem label="Severity">
                        <Select
                            options={SEVERITY_OPTS}
                            value={
                                SEVERITY_OPTS.find(
                                    (o) => o.value === severity,
                                ) ?? SEVERITY_OPTS[0]
                            }
                            onChange={(o) => {
                                setSeverity((o as Opt)?.value ?? '')
                                resetPage()
                            }}
                        />
                    </FormItem>
                    <FormItem label="Domain">
                        <Select
                            options={DOMAIN_OPTS}
                            value={
                                DOMAIN_OPTS.find((o) => o.value === domain) ??
                                DOMAIN_OPTS[0]
                            }
                            onChange={(o) => {
                                setDomain((o as Opt)?.value ?? '')
                                resetPage()
                            }}
                        />
                    </FormItem>
                    <FormItem label="From">
                        <input
                            type="date"
                            className="input input-sm w-full"
                            max={dateTo || undefined}
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value)
                                resetPage()
                            }}
                        />
                    </FormItem>
                    <FormItem label="To">
                        <input
                            type="date"
                            className="input input-sm w-full"
                            min={dateFrom || undefined}
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value)
                                resetPage()
                            }}
                        />
                    </FormItem>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700/60">
                    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800/50">
                        <input
                            type="checkbox"
                            checked={includeStale}
                            onChange={(e) => {
                                setIncludeStale(e.target.checked)
                                resetPage()
                            }}
                        />
                        Include stale exceptions (&gt; 90 days)
                    </label>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {total > 0 ? (
                            <>
                                Showing{' '}
                                <span className="font-semibold text-gray-700 tabular-nums dark:text-gray-200">
                                    {rangeStart}–{rangeEnd}
                                </span>{' '}
                                of{' '}
                                <span className="font-semibold text-gray-700 tabular-nums dark:text-gray-200">
                                    {total}
                                </span>{' '}
                                exception{total === 1 ? '' : 's'}
                            </>
                        ) : (
                            'No matching exceptions'
                        )}
                    </p>
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="@container">
                    <DataTable<MmExceptionItem>
                        columns={columns}
                        data={rows}
                        compact
                        fit
                        loading={loading}
                        getRowId={(row) => row.id}
                        rowClassName={(row, index) => excTableRowClass(row, index)}
                        noData={!loading && rows.length === 0}
                        pageSizes={PAGE_SIZES}
                        pagingData={{ total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => {
                            setPageSize(size)
                            setPage(1)
                        }}
                    />
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ExceptionCenterPage
