'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProcurementResponsiveTable, { type ColumnDef } from '../components/ProcurementResponsiveTable'
import {
    PrcAnimatedStatus,
    PrcDateCell,
    PrcDocNumberCell,
    PrcMoneyCell,
    PrcPlainCell,
    PrcQtyCell,
    PRC_PO_STATUS,
    prcStatusTone,
} from '../components/procurementTableUi'
import { procurementParentBreadcrumbs } from '../utils/procurementPageUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineFilter, HiOutlineSearch, HiOutlineX } from 'react-icons/hi'
import {
    procurementHistoryService,
    type ProcurementHistoryRow,
} from '../services/procurementHistoryService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { getApiErrorMessage } from '@/modules/mm/shared/apiError'

const ROUTE = '/modules/mm/procurement/procurement-history'
type Opt = { value: string; label: string }

type Filters = {
    companyId: string
    supplierId: string
    materialId: string
    buyerId: string
    poNumber: string
    dateFrom: string
    dateTo: string
    minPrice: string
    maxPrice: string
    minQty: string
    maxQty: string
}

type FilterChipKey =
    | 'supplierId'
    | 'materialId'
    | 'poNumber'
    | 'buyerId'
    | 'dateRange'
    | 'priceRange'
    | 'qtyRange'

const EMPTY_FILTERS: Filters = {
    companyId: '',
    supplierId: '',
    materialId: '',
    buyerId: '',
    poNumber: '',
    dateFrom: '',
    dateTo: '',
    minPrice: '',
    maxPrice: '',
    minQty: '',
    maxQty: '',
}

function toDateInput(value: Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function rangeLabel(min: string, max: string, fallback: string) {
    if (!min && !max) return fallback
    return `${min ? Number(min).toLocaleString() : '0'} – ${
        max ? Number(max).toLocaleString() : '∞'
    }`
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ProcurementHistoryPage = () => {
    const router = useRouter()
    const parentBreadcrumbs = procurementParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ProcurementHistoryRow[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const { companies, suppliers, materials, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'suppliers',
        'materials',
    )
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
    const [advancedOpen, setAdvancedOpen] = useState(false)

    useEffect(() => {
        if (!filters.companyId && companies[0]) {
            setFilters((p) => ({ ...p, companyId: companies[0].value }))
        }
    }, [companies, filters.companyId])

    const fetchRows = useCallback(async (f: Filters) => {
        setLoading(true)
        try {
            const res = await procurementHistoryService.search({
                companyId: f.companyId || undefined,
                supplierId: f.supplierId || undefined,
                materialId: f.materialId || undefined,
                buyerId: f.buyerId || undefined,
                poNumber: f.poNumber || undefined,
                dateFrom: f.dateFrom || undefined,
                dateTo: f.dateTo || undefined,
                minPrice: f.minPrice ? Number(f.minPrice) : undefined,
                maxPrice: f.maxPrice ? Number(f.maxPrice) : undefined,
                minQty: f.minQty ? Number(f.minQty) : undefined,
                maxQty: f.maxQty ? Number(f.maxQty) : undefined,
                pageSize: 100,
            })
            setRows(res.data)
            setTotal(res.meta.total)
        } catch (e) {
            pushToast('danger', 'Error', getApiErrorMessage(e, 'Search failed'))
        } finally {
            setLoading(false)
        }
    }, [])

    const load = useCallback(() => fetchRows(filters), [fetchRows, filters])

    useEffect(() => {
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [loadFilterRefs])

    useEffect(() => {
        if (filters.companyId) void fetchRows(filters)
    }, [filters.companyId]) // eslint-disable-line react-hooks/exhaustive-deps

    const chips = useMemo(() => {
        const list: Array<{ key: FilterChipKey; label: string; value: string }> = []
        if (filters.supplierId) {
            list.push({
                key: 'supplierId',
                label: 'Supplier',
                value:
                    suppliers.find((s) => s.value === filters.supplierId)?.label ??
                    'Selected supplier',
            })
        }
        if (filters.materialId) {
            list.push({
                key: 'materialId',
                label: 'Material',
                value:
                    materials.find((m) => m.value === filters.materialId)?.label ??
                    'Selected material',
            })
        }
        if (filters.poNumber) {
            list.push({ key: 'poNumber', label: 'PO', value: filters.poNumber })
        }
        if (filters.buyerId) {
            list.push({ key: 'buyerId', label: 'Buyer', value: filters.buyerId })
        }
        if (filters.dateFrom || filters.dateTo) {
            list.push({
                key: 'dateRange',
                label: 'Date',
                value:
                    filters.dateFrom && filters.dateTo
                        ? `${filters.dateFrom} → ${filters.dateTo}`
                        : filters.dateFrom
                          ? `From ${filters.dateFrom}`
                          : `Until ${filters.dateTo}`,
            })
        }
        if (filters.minPrice || filters.maxPrice) {
            list.push({
                key: 'priceRange',
                label: 'Unit price',
                value: rangeLabel(filters.minPrice, filters.maxPrice, 'Any'),
            })
        }
        if (filters.minQty || filters.maxQty) {
            list.push({
                key: 'qtyRange',
                label: 'Quantity',
                value: rangeLabel(filters.minQty, filters.maxQty, 'Any'),
            })
        }
        return list
    }, [filters, suppliers, materials])

    const advancedCount = [
        filters.buyerId,
        filters.dateFrom,
        filters.dateTo,
        filters.minPrice,
        filters.maxPrice,
        filters.minQty,
        filters.maxQty,
    ].filter(Boolean).length

    const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            void load()
        }
    }

    const clearChip = (key: FilterChipKey) => {
        let next = filters
        if (key === 'dateRange') {
            next = { ...filters, dateFrom: '', dateTo: '' }
        } else if (key === 'priceRange') {
            next = { ...filters, minPrice: '', maxPrice: '' }
        } else if (key === 'qtyRange') {
            next = { ...filters, minQty: '', maxQty: '' }
        } else {
            next = { ...filters, [key]: '' }
        }
        setFilters(next)
        void fetchRows(next)
    }

    const resetFilters = () => {
        const next: Filters = { ...EMPTY_FILTERS, companyId: filters.companyId }
        setFilters(next)
        setAdvancedOpen(false)
        void fetchRows(next)
    }

    const applyDatePreset = (preset: '30d' | '90d' | 'ytd') => {
        const to = new Date()
        const from = new Date(to)
        if (preset === 'ytd') {
            from.setMonth(0, 1)
        } else {
            from.setDate(from.getDate() - (preset === '30d' ? 30 : 90))
        }
        const next: Filters = {
            ...filters,
            dateFrom: toDateInput(from),
            dateTo: toDateInput(to),
        }
        setFilters(next)
        void fetchRows(next)
    }

    const columns: ColumnDef<ProcurementHistoryRow>[] = useMemo(
        () => [
            {
                header: 'PO line',
                cell: ({ row }) => (
                    <PrcDocNumberCell
                        icon="po"
                        primary={row.original.poNumber}
                        secondary={row.original.material?.materialCode}
                        onClick={() =>
                            router.push(
                                `/modules/mm/procurement/purchase-orders/${row.original.poId}`,
                            )
                        }
                    />
                ),
            },
            {
                header: 'Date',
                cell: ({ row }) => <PrcDateCell iso={String(row.original.date)} />,
            },
            {
                header: 'Supplier',
                cell: ({ row }) => (
                    <SmEntityCell
                        kind="supplier"
                        primary={row.original.supplier?.supplierName}
                        secondary={row.original.supplier?.supplierCode}
                    />
                ),
            },
            {
                header: 'Material',
                cell: ({ row }) => (
                    <SmEntityCell
                        kind="material"
                        primary={row.original.material?.materialName}
                        secondary={row.original.material?.materialCode}
                    />
                ),
            },
            {
                header: 'Qty',
                cell: ({ row }) => <PrcQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Price',
                cell: ({ row }) => <PrcMoneyCell amount={row.original.unitPrice} />,
            },
            {
                header: 'Buyer',
                cell: ({ row }) => <PrcPlainCell mono>{row.original.buyerId}</PrcPlainCell>,
            },
            {
                header: 'PO status',
                cell: ({ row }) => (
                    <PrcAnimatedStatus
                        status={row.original.poStatus}
                        tone={prcStatusTone(row.original.poStatus, PRC_PO_STATUS)}
                    />
                ),
            },
        ],
        [router],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Procurement History"
                description="Search past PO lines by supplier, material, or PO number"
            />
            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <FormItem label="Company">
                            <Select<Opt>
                                options={companies}
                                value={
                                    companies.find(
                                        (c) => c.value === filters.companyId,
                                    ) ?? null
                                }
                                onChange={(o) =>
                                    setFilters((p) => ({
                                        ...p,
                                        companyId: o?.value ?? '',
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Supplier">
                            <Select<Opt>
                                options={suppliers}
                                value={
                                    suppliers.find(
                                        (s) => s.value === filters.supplierId,
                                    ) ?? null
                                }
                                onChange={(o) =>
                                    setFilters((p) => ({
                                        ...p,
                                        supplierId: o?.value ?? '',
                                    }))
                                }
                                isClearable
                            />
                        </FormItem>
                        <FormItem label="Material">
                            <Select<Opt>
                                options={materials}
                                value={
                                    materials.find(
                                        (m) => m.value === filters.materialId,
                                    ) ?? null
                                }
                                onChange={(o) =>
                                    setFilters((p) => ({
                                        ...p,
                                        materialId: o?.value ?? '',
                                    }))
                                }
                                isClearable
                            />
                        </FormItem>
                        <FormItem label="PO number">
                            <Input
                                prefix={
                                    <HiOutlineSearch className="text-lg text-gray-400" />
                                }
                                placeholder="Search PO number"
                                value={filters.poNumber}
                                onChange={(e) =>
                                    setFilters((p) => ({
                                        ...p,
                                        poNumber: e.target.value,
                                    }))
                                }
                                onKeyDown={onSearchKeyDown}
                            />
                        </FormItem>
                    </div>

                    {advancedOpen && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                        Refine results
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Narrow by buyer, dates, price, or quantity.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Quick dates
                                    </span>
                                    {(
                                        [
                                            ['Last 30 days', '30d'],
                                            ['Last 90 days', '90d'],
                                            ['This year', 'ytd'],
                                        ] as const
                                    ).map(([label, preset]) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => applyDatePreset(preset)}
                                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-primary dark:hover:text-primary"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <FormItem label="Buyer">
                                    <Input
                                        placeholder="Buyer ID"
                                        value={filters.buyerId}
                                        onChange={(e) =>
                                            setFilters((p) => ({
                                                ...p,
                                                buyerId: e.target.value,
                                            }))
                                        }
                                        onKeyDown={onSearchKeyDown}
                                    />
                                </FormItem>
                                <FormItem label="Date range">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                From
                                            </span>
                                            <Input
                                                type="date"
                                                aria-label="Date from"
                                                value={filters.dateFrom}
                                                onChange={(e) =>
                                                    setFilters((p) => ({
                                                        ...p,
                                                        dateFrom: e.target.value,
                                                    }))
                                                }
                                                onKeyDown={onSearchKeyDown}
                                            />
                                        </div>
                                        <div>
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                To
                                            </span>
                                            <Input
                                                type="date"
                                                aria-label="Date to"
                                                value={filters.dateTo}
                                                onChange={(e) =>
                                                    setFilters((p) => ({
                                                        ...p,
                                                        dateTo: e.target.value,
                                                    }))
                                                }
                                                onKeyDown={onSearchKeyDown}
                                            />
                                        </div>
                                    </div>
                                </FormItem>
                                <FormItem label="Unit price range">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            placeholder="Min"
                                            value={filters.minPrice}
                                            onChange={(e) =>
                                                setFilters((p) => ({
                                                    ...p,
                                                    minPrice: e.target.value,
                                                }))
                                            }
                                            onKeyDown={onSearchKeyDown}
                                        />
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            placeholder="Max"
                                            value={filters.maxPrice}
                                            onChange={(e) =>
                                                setFilters((p) => ({
                                                    ...p,
                                                    maxPrice: e.target.value,
                                                }))
                                            }
                                            onKeyDown={onSearchKeyDown}
                                        />
                                    </div>
                                </FormItem>
                                <FormItem label="Quantity range">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="Min"
                                            value={filters.minQty}
                                            onChange={(e) =>
                                                setFilters((p) => ({
                                                    ...p,
                                                    minQty: e.target.value,
                                                }))
                                            }
                                            onKeyDown={onSearchKeyDown}
                                        />
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="Max"
                                            value={filters.maxQty}
                                            onChange={(e) =>
                                                setFilters((p) => ({
                                                    ...p,
                                                    maxQty: e.target.value,
                                                }))
                                            }
                                            onKeyDown={onSearchKeyDown}
                                        />
                                    </div>
                                </FormItem>
                            </div>
                        </div>
                    )}

                    {chips.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                Active filters
                            </span>
                            {chips.map((chip) => (
                                <span
                                    key={chip.key}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    <span className="font-medium text-gray-500 dark:text-gray-400">
                                        {chip.label}
                                    </span>
                                    <span className="max-w-[220px] truncate font-semibold">
                                        {chip.value}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => clearChip(chip.key)}
                                        aria-label={`Remove ${chip.label} filter`}
                                        className="rounded-full p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                                    >
                                        <HiOutlineX className="text-sm" />
                                    </button>
                                </span>
                            ))}
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="ml-1 text-xs font-semibold text-primary transition hover:underline"
                            >
                                Clear all
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 lg:flex-row lg:items-center lg:justify-between dark:border-gray-700">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlineSearch />}
                                onClick={load}
                                loading={loading}
                            >
                                Search
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                icon={<HiOutlineFilter />}
                                onClick={() => setAdvancedOpen((v) => !v)}
                                aria-expanded={advancedOpen}
                            >
                                {advancedOpen ? 'Hide filters' : 'More filters'}
                                {advancedCount > 0 && (
                                    <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                                        {advancedCount}
                                    </span>
                                )}
                            </Button>
                            {chips.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="plain"
                                    onClick={resetFilters}
                                >
                                    Reset
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {loading ? (
                                'Searching…'
                            ) : (
                                <>
                                    <span className="font-semibold text-gray-800 dark:text-gray-100">
                                        {total.toLocaleString()}
                                    </span>{' '}
                                    matching PO line{total === 1 ? '' : 's'}
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <ProcurementResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) => `${row.poId}-${row.material?.materialCode ?? index}`}
                    tableMinWidthClass="min-w-[960px]"
                />
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Showing {rows.length.toLocaleString()} of{' '}
                    {total.toLocaleString()} matching line
                    {total === 1 ? '' : 's'}
                    {rows.length < total ? '. Refine the filters to narrow the results.' : '.'}
                </p>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ProcurementHistoryPage
