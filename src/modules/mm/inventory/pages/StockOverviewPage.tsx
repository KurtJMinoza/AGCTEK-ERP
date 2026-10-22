'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineCube,
    HiOutlineRefresh,
    HiOutlineArchive,
} from 'react-icons/hi'
import Link from 'next/link'
import {
    inventoryService,
    type BalanceSummary,
    type InventoryBalance,
} from '../services/inventoryService'
import {
    useDeferredFilterRefs,
    useLazyBinsForWarehouse,
} from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/stock-overview'
const LEDGER_ROUTE = '/modules/mm/inventory-management/inventory-ledger'

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function n(v: string | number | undefined) {
    return Number(v ?? 0)
}

const fmt = (v: number) => v.toLocaleString()

/** Relative "last updated" label. */
function ago(iso?: string) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    if (Number.isNaN(diff)) return '—'
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} d ago`
    return new Date(iso).toLocaleDateString()
}

/** Stock status → tag colour. */
const STATUS_TONE: Record<string, string> = {
    UNRESTRICTED: 'green',
    RESTRICTED: 'red',
    QUARANTINE: 'red',
    BLOCKED: 'red',
    HOLD: 'yellow',
    INSPECTION: 'yellow',
    DAMAGED: 'red',
}

const StockOverviewPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const {
        companies,
        warehouses,
        materials,
        loadFilterRefs,
    } = useDeferredFilterRefs('companies', 'warehouses', 'materials')
    const { loadForWarehouse, rows: binRows } = useLazyBinsForWarehouse()

    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [storageBinId, setStorageBinId] = useState('')
    const [stockStatus, setStockStatus] = useState('')
    const [search, setSearch] = useState('')
    const [summary, setSummary] = useState<BalanceSummary | null>(null)
    const [rows, setRows] = useState<InventoryBalance[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 })
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)

    // Bins depend on the chosen warehouse.
    useEffect(() => {
        void loadForWarehouse(warehouseId || '')
    }, [warehouseId, loadForWarehouse])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = {
                companyId: companyId || undefined,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                storageBinId: storageBinId || undefined,
                stockStatus: stockStatus || undefined,
                search: search.trim() || undefined,
            }
            const [res, sum] = await Promise.all([
                inventoryService.balances({ ...params, page, limit: 50 }),
                inventoryService.balanceSummary(params),
            ])
            setRows(res.data)
            setSummary(sum)
            setMeta({
                total: res.meta.total,
                page: res.meta.page,
                limit: res.meta.limit,
            })
        } catch (e: unknown) {
            const err = e as {
                response?: { data?: { message?: string } }
                message?: string
            }
            pushToast(
                'danger',
                'Load failed',
                err?.response?.data?.message ?? err?.message ?? 'Unknown error',
            )
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, materialId, storageBinId, stockStatus, search, page])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const statusFilterOpts = useMemo(
        () => [
            { value: '', label: 'All statuses' },
            ...(summary?.byStatus.map((s) => ({
                value: s.status,
                label: `${s.status} (${s.rowCount})`,
            })) ?? []),
        ],
        [summary],
    )

    // Only warehouses of the selected company — never all warehouses.
    const warehouseOptions = useMemo(
        () =>
            warehouses.filter((w) => {
                const company = (w.meta as { companyId?: string } | undefined)
                    ?.companyId
                return !companyId || !company || company === companyId
            }),
        [warehouses, companyId],
    )

    // Only materials of the selected company.
    const materialOptions = useMemo(
        () =>
            companyId
                ? materials.filter(
                      (m) =>
                          (m.meta as { companyId?: string } | undefined)
                              ?.companyId === companyId,
                  )
                : materials,
        [materials, companyId],
    )

    const binOptions = useMemo<Opt[]>(
        () =>
            binRows.map((bin) => ({
                value: bin.id,
                label: bin.code,
            })),
        [binRows],
    )

    /** Active filters, shown as removable chips. */
    const activeFilters = useMemo(() => {
        const list: FilterChip[] = []
        const labelOf = (opts: Opt[], value: string) =>
            opts.find((o) => o.value === value)?.label ?? value
        if (companyId)
            list.push({
                key: 'companyId',
                label: `Company: ${labelOf(companies, companyId)}`,
                onRemove: () => {
                    setCompanyId('')
                    setWarehouseId('')
                    setMaterialId('')
                },
            })
        if (warehouseId)
            list.push({
                key: 'warehouseId',
                label: `Warehouse: ${labelOf(warehouseOptions, warehouseId)}`,
                onRemove: () => {
                    setWarehouseId('')
                    setStorageBinId('')
                },
            })
        if (materialId)
            list.push({
                key: 'materialId',
                label: `Material: ${labelOf(materialOptions, materialId)}`,
                onRemove: () => setMaterialId(''),
            })
        if (storageBinId)
            list.push({
                key: 'storageBinId',
                label: `Bin: ${labelOf(binOptions, storageBinId)}`,
                onRemove: () => setStorageBinId(''),
            })
        if (stockStatus)
            list.push({
                key: 'stockStatus',
                label: `Status: ${stockStatus}`,
                onRemove: () => setStockStatus(''),
            })
        if (search.trim())
            list.push({
                key: 'search',
                label: `Search: "${search.trim()}"`,
                onRemove: () => setSearch(''),
            })
        return list
    }, [
        companyId,
        warehouseId,
        materialId,
        storageBinId,
        stockStatus,
        search,
        companies,
        warehouseOptions,
        materialOptions,
        binOptions,
    ])

    const clearAll = () => {
        setCompanyId('')
        setWarehouseId('')
        setMaterialId('')
        setStorageBinId('')
        setStockStatus('')
        setSearch('')
        setPage(1)
    }

    /** The filter toolbar fields. */
    const filterFields = useMemo<FilterField[]>(
        () => [
            {
                key: 'search',
                label: 'Search',
                kind: 'text',
                value: search,
                placeholder: 'Material number, name or SKU',
                onChange: (value) => {
                    setSearch(value)
                    setPage(1)
                },
            },
            {
                key: 'companyId',
                label: 'Company',
                value: companyId,
                options: companies,
                onChange: (value) => {
                    setCompanyId(value)
                    // Drop a warehouse that no longer belongs to the chosen company.
                    const selected = warehouses.find((w) => w.value === warehouseId)
                    const selectedCompanyId = (
                        selected?.meta as { companyId?: string } | undefined
                    )?.companyId
                    if (value && selectedCompanyId && selectedCompanyId !== value) {
                        setWarehouseId('')
                        setStorageBinId('')
                    }
                    setPage(1)
                },
            },
            {
                key: 'warehouseId',
                label: 'Warehouse',
                value: warehouseId,
                options: warehouseOptions,
                onChange: (value) => {
                    setWarehouseId(value)
                    setStorageBinId('')
                    setPage(1)
                },
            },
            {
                key: 'materialId',
                label: 'Material',
                value: materialId,
                options: materialOptions,
                onChange: (value) => {
                    setMaterialId(value)
                    setPage(1)
                },
            },
            {
                key: 'storageBinId',
                label: 'Bin',
                value: storageBinId,
                options: binOptions,
                onChange: (value) => {
                    setStorageBinId(value)
                    setPage(1)
                },
            },
            {
                key: 'stockStatus',
                label: 'Status',
                value: stockStatus,
                options: statusFilterOpts,
                onChange: (value) => {
                    setStockStatus(value)
                    setPage(1)
                },
            },
        ],
        [
            search,
            companyId,
            warehouseId,
            materialId,
            storageBinId,
            stockStatus,
            companies,
            warehouses,
            warehouseOptions,
            materialOptions,
            binOptions,
            statusFilterOpts,
        ],
    )

    const reservedPct =
        summary && summary.onHand > 0
            ? Math.min(100, Math.round((summary.reserved / summary.onHand) * 100))
            : 0

    const columns: ColumnDef<InventoryBalance>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => {
                    const m = row.original.material
                    return (
                        <div className="min-w-[12rem]">
                            <div className="font-semibold text-gray-900">
                                {m?.materialCode ?? row.original.materialId.slice(0, 8)}
                            </div>
                            <div className="truncate text-xs text-gray-500">
                                {m?.materialName ?? '—'}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'SKU',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs text-gray-700">
                        {row.original.material?.sku || '—'}
                    </span>
                ),
            },
            {
                header: 'Category',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm text-gray-600">
                        {row.original.material?.materialCategory?.name ?? '—'}
                    </span>
                ),
            },
            {
                header: 'UoM',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm text-gray-600">
                        {row.original.material?.baseUom?.code ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Company',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm text-gray-600">
                        {row.original.company?.code ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm text-gray-600">
                        {row.original.warehouse?.code ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Location',
                cell: ({ row }) => (
                    <div className="whitespace-nowrap text-xs text-gray-600">
                        <div className="font-mono">
                            {row.original.storageBin?.code ?? '—'}
                        </div>
                        {row.original.batch?.batchNumber ? (
                            <div className="text-gray-400">
                                Batch {row.original.batch.batchNumber}
                            </div>
                        ) : null}
                        {row.original.serialNumber?.serialNumber ? (
                            <div className="text-gray-400">
                                Ser {row.original.serialNumber.serialNumber}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <Tag
                        className={
                            STATUS_TONE[row.original.stockStatus] === 'green'
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                                : STATUS_TONE[row.original.stockStatus] === 'red'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        }
                    >
                        {row.original.stockStatus}
                    </Tag>
                ),
            },
            {
                header: 'On hand',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-medium text-gray-900">
                        {fmt(n(row.original.quantity))}
                    </span>
                ),
            },
            {
                header: 'Reserved',
                cell: ({ row }) => (
                    <span
                        className={`whitespace-nowrap ${
                            n(row.original.reservedQuantity) > 0
                                ? 'font-medium text-amber-700 dark:text-amber-300'
                                : 'text-gray-500'
                        }`}
                    >
                        {fmt(n(row.original.reservedQuantity))}
                    </span>
                ),
            },
            {
                header: 'Available',
                cell: ({ row }) => {
                    const onHand = n(row.original.quantity)
                    const available = n(row.original.availableQuantity)
                    const pct = onHand > 0 ? (available / onHand) * 100 : 0
                    return (
                        <div className="min-w-[6rem]">
                            <div className="font-semibold text-gray-900">
                                {fmt(available)}
                            </div>
                            <Progress
                                percent={Math.round(pct)}
                                className="mt-1 h-1"
                                customColorClass="bg-emerald-500"
                            />
                            <div className="text-[11px] text-gray-400">
                                {Math.round(pct)}% free
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Updated',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-gray-500">
                        {ago(row.original.updatedAt)}
                    </span>
                ),
            },
            {
                header: '',
                id: 'ledger',
                cell: ({ row }) => (
                    <Link
                        href={`${LEDGER_ROUTE}?materialId=${row.original.materialId}&warehouseId=${row.original.warehouseId}`}
                        className="text-primary text-sm hover:underline"
                    >
                        Ledger
                    </Link>
                ),
            },
        ],
        [],
    )

    const summaryCards = useMemo(
        () => [
            {
                label: 'On hand',
                value: summary?.onHand ?? 0,
                tone: 'default' as const,
                icon: <HiOutlineCube className="text-xl" />,
            },
            {
                label: 'Reserved',
                value: summary?.reserved ?? 0,
                tone: 'warning' as const,
                icon: <HiOutlineArchive className="text-xl" />,
                badge: {
                    tone: 'warning' as const,
                    label: `${reservedPct}% of on hand`,
                },
            },
            {
                label: 'Available (ATP)',
                value: summary?.available ?? 0,
                tone: 'success' as const,
                icon: <HiOutlineCube className="text-xl" />,
            },
            {
                label: 'Restricted',
                value: summary?.restricted ?? 0,
                tone: 'danger' as const,
                icon: <HiOutlineArchive className="text-xl" />,
            },
        ],
        [summary, reservedPct],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Stock Overview"
                description="On-hand, reserved, and available balances from the inventory ledger."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                }
            />

            {/* Filters */}
            <FilterBar
                className="mb-4"
                fields={filterFields}
                chips={activeFilters}
                onClear={clearAll}
                actions={
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                }
            />

            {/* Summary */}
            <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                    <StatCard
                        key={card.label}
                        label={card.label}
                        value={fmt(card.value)}
                        tone={card.tone}
                        icon={card.icon}
                        badge={card.badge}
                    />
                ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {summary?.rowCount ?? 0} balance row
                    {summary?.rowCount === 1 ? '' : 's'} in scope
                </span>
                <span>
                    Page {meta.page} · {meta.limit} per page
                </span>
            </div>

            {/* Table */}
            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    compact
                    pagingData={{
                        total: meta.total,
                        pageIndex: page,
                        pageSize: meta.limit,
                    }}
                    onPaginationChange={setPage}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default StockOverviewPage
