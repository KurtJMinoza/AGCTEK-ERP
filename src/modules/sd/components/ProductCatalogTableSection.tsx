'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlineFilter,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineRefresh,
    HiOutlineUpload,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProductVariantsSubRow from './ProductVariantsSubRow'
import { type ColumnDef, type OnSortParam } from '@/components/shared/DataTable'
import SdDataTable from './SdDataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
    fetchCatalogVariantsSummary,
    fetchProductCatalogStock,
    type CatalogVariantsSummary,
    type ProductLifecycleStatus,
    type SdProductRecord,
} from '../services/productCatalogService'
import type { CatalogStockSnapshot } from '../utils/productCatalogTableColors'
import { downloadProductCatalogCsv } from '../utils/productCatalogExport'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    PcBadgeCell,
    PcCategoryCell,
    PcCompanyCell,
    PcPriceCell,
    PcProductIdentityCell,
    PcStockCell,
    PcVariantsCell,
    PcVisibilityCell,
} from './ProductCatalogTableCells'

type FilterOption = { value: string; label: string }

export type ProductCatalogTableSectionProps = {
    products: SdProductRecord[]
    loading: boolean
    searchInput: string
    onSearchInputChange: (value: string) => void
    companyFilter: string
    onCompanyFilterChange: (value: string) => void
    companyFilterOptions: FilterOption[]
    statusFilter: 'all' | ProductLifecycleStatus
    onStatusFilterChange: (value: 'all' | ProductLifecycleStatus) => void
    togglingId: string | null
    onToggleActive: (product: SdProductRecord, isActive: boolean) => void
    onEdit: (product: SdProductRecord) => void
    onDelete: (product: SdProductRecord) => void
    onAddProduct: () => void
    onAddVariant?: (product: SdProductRecord) => void
    onRefresh?: () => void
    refreshing?: boolean
}

const LIFECYCLE_OPTIONS: FilterOption[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ARCHIVED', label: 'Archived' },
]

const ProductCatalogTableSection = ({
    products,
    loading,
    searchInput,
    onSearchInputChange,
    companyFilter,
    onCompanyFilterChange,
    companyFilterOptions,
    statusFilter,
    onStatusFilterChange,
    togglingId,
    onToggleActive,
    onEdit,
    onDelete,
    onAddProduct,
    onAddVariant,
    onRefresh,
    refreshing,
}: ProductCatalogTableSectionProps) => {
    const { canCreate, canUpdate, canDelete } = useResourceAccess('sd.product-catalog')
    const [filterOpen, setFilterOpen] = useState(false)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [sort, setSort] = useState<OnSortParam>({ key: '', order: '' })
    const [stockByProductId, setStockByProductId] = useState<
        Record<string, CatalogStockSnapshot>
    >({})
    const [stockLoading, setStockLoading] = useState(false)
    const [variantsSummary, setVariantsSummary] = useState<
        Record<string, CatalogVariantsSummary>
    >({})

    useEffect(() => {
        if (!products.length) {
            setStockByProductId({})
            setVariantsSummary({})
            return
        }
        let cancelled = false
        setStockLoading(true)
        fetchProductCatalogStock(products)
            .then((stocks) => {
                if (!cancelled) setStockByProductId(stocks)
            })
            .catch(() => {
                if (!cancelled) setStockByProductId({})
            })
            .finally(() => {
                if (!cancelled) setStockLoading(false)
            })
        fetchCatalogVariantsSummary({
            divisionId: products[0]?.divisionId,
        })
            .then((rows) => {
                if (cancelled) return
                setVariantsSummary(
                    Object.fromEntries(rows.map((row) => [row.productId, row])),
                )
            })
            .catch(() => {
                if (!cancelled) setVariantsSummary({})
            })
        return () => {
            cancelled = true
        }
    }, [products])

    const sortedProducts = useMemo(() => {
        const rows = [...products]
        if (!sort.key || !sort.order) return rows
        const dir = sort.order === 'desc' ? -1 : 1
        const compareString = (a: string, b: string) => a.localeCompare(b) * dir
        const compareNumber = (a: number, b: number) => (a - b) * dir
        rows.sort((a, b) => {
            switch (sort.key) {
                case 'product':
                    return compareString(a.name, b.name)
                case 'company':
                    return compareString(
                        a.company?.name ?? '',
                        b.company?.name ?? '',
                    )
                case 'category':
                    return compareString(a.category, b.category)
                case 'price':
                    return compareNumber(a.price, b.price)
                case 'badge':
                    return compareString(a.badge ?? '', b.badge ?? '')
                case 'visible':
                    return compareNumber(Number(a.isActive), Number(b.isActive))
                case 'stock': {
                    const qty = (id: string) =>
                        stockByProductId[id]?.availableQty ?? -1
                    return compareNumber(qty(a.id), qty(b.id))
                }
                default:
                    return 0
            }
        })
        return rows
    }, [products, sort, stockByProductId])

    const total = sortedProducts.length
    const pagedProducts = useMemo(() => {
        const start = (page - 1) * pageSize
        return sortedProducts.slice(start, start + pageSize)
    }, [sortedProducts, page, pageSize])

    const handleSort = useCallback((next: OnSortParam) => {
        setSort(next)
        setPage(1)
    }, [])

    const handleCheckBoxChange = useCallback((checked: boolean, row: SdProductRecord) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(row.id)
            else next.delete(row.id)
            return next
        })
    }, [])

    const handleSelectAllChange = useCallback(
        (checked: boolean, rows: { original: SdProductRecord }[]) => {
            setSelectedIds((prev) => {
                const next = new Set(prev)
                for (const r of rows) {
                    if (checked) next.add(r.original.id)
                    else next.delete(r.original.id)
                }
                return next
            })
        },
        [],
    )

    const columns = useMemo<ColumnDef<SdProductRecord>[]>(
        () => [
            {
                id: 'product',
                header: 'Product',
                enableSorting: true,
                size: 220,
                minSize: 140,
                cell: ({ row }) => (
                    <PcProductIdentityCell
                        product={row.original}
                        stockSnapshot={stockByProductId[row.original.id]}
                        variantsSummary={variantsSummary[row.original.id]}
                    />
                ),
            },
            {
                id: 'company',
                header: 'Company',
                enableSorting: true,
                size: 160,
                minSize: 120,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) => <PcCompanyCell product={row.original} />,
            },
            {
                id: 'category',
                header: 'Category',
                enableSorting: true,
                size: 120,
                minSize: 96,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <PcCategoryCell category={row.original.category} />
                ),
            },
            {
                id: 'price',
                header: 'Price',
                enableSorting: true,
                size: 100,
                minSize: 88,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => <PcPriceCell product={row.original} />,
            },
            {
                id: 'stock',
                header: 'Stock',
                enableSorting: true,
                size: 140,
                minSize: 110,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => (
                    <PcStockCell
                        stockSnapshot={stockByProductId[row.original.id]}
                        variantsSummary={variantsSummary[row.original.id]}
                    />
                ),
            },
            {
                id: 'badge',
                header: 'Badge',
                enableSorting: true,
                size: 96,
                minSize: 80,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <PcBadgeCell badge={row.original.badge} />
                ),
            },
            {
                id: 'visible',
                header: 'Visible',
                enableSorting: true,
                size: 120,
                minSize: 56,
                cell: ({ row }) => (
                    <PcVisibilityCell
                        active={row.original.isActive}
                        toggling={togglingId === row.original.id}
                        canUpdate={canUpdate}
                        onToggle={(checked) =>
                            onToggleActive(row.original, checked)
                        }
                    />
                ),
            },
            {
                id: 'variants',
                header: 'Variants',
                size: 108,
                minSize: 88,
                meta: { className: 'hidden sm:table-cell' },
                cell: ({ row }) => {
                    const count =
                        variantsSummary[row.original.id]?.variantCount ??
                        row.original.variantCount ??
                        0
                    return (
                        <PcVariantsCell count={count} expandable={count > 0} />
                    )
                },
            },
            {
                id: 'actions',
                header: '',
                size: 72,
                minSize: 64,
                cell: ({ row }) => (
                    <div
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        {canUpdate && (
                            <Button
                                size="sm"
                                variant="plain"
                                className="text-gray-500 hover:text-primary"
                                icon={<HiOutlinePencil className="text-lg" />}
                                aria-label={`Edit ${row.original.name}`}
                                onClick={() => onEdit(row.original)}
                            />
                        )}
                        {canDelete && (
                            <Button
                                size="sm"
                                variant="plain"
                                className="text-gray-500 hover:text-rose-600"
                                icon={<HiOutlineTrash className="text-lg" />}
                                aria-label={`Delete ${row.original.name}`}
                                onClick={() => onDelete(row.original)}
                            />
                        )}
                    </div>
                ),
            },
        ],
        [
            onDelete,
            onEdit,
            onToggleActive,
            stockByProductId,
            variantsSummary,
            togglingId,
            canUpdate,
            canDelete,
        ],
    )

    return (
        <AdaptiveCard className="mt-2 border border-gray-200 shadow-sm dark:border-gray-700">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                    Products
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    {onRefresh ? (
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh className="text-lg" />}
                            loading={refreshing}
                            onClick={onRefresh}
                        >
                            Refresh
                        </Button>
                    ) : null}
                    <Button
                        size="sm"
                        icon={<HiOutlineUpload className="text-lg rotate-180" />}
                        disabled={!products.length}
                        onClick={() =>
                            downloadProductCatalogCsv(products, stockByProductId)
                        }
                    >
                        Export
                    </Button>
                    {canCreate && (
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={onAddProduct}
                        >
                            Add products
                        </Button>
                    )}
                </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_auto]">
                <Input
                    prefix={<HiOutlineSearch className="text-lg text-gray-400" />}
                    placeholder="Search products…"
                    value={searchInput}
                    onChange={(e) => {
                        onSearchInputChange(e.target.value)
                        setPage(1)
                    }}
                />
                <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    icon={<HiOutlineFilter />}
                    onClick={() => setFilterOpen((open) => !open)}
                >
                    {filterOpen ? 'Hide filters' : 'Filters'}
                </Button>
            </div>

            {filterOpen ? (
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40 sm:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Company
                        </label>
                        <Select<FilterOption>
                            isSearchable={false}
                            options={companyFilterOptions}
                            value={companyFilterOptions.find(
                                (option) => option.value === companyFilter,
                            )}
                            onChange={(option) => {
                                onCompanyFilterChange(option?.value ?? 'all')
                                setPage(1)
                            }}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Lifecycle
                        </label>
                        <Select<FilterOption>
                            isSearchable={false}
                            options={LIFECYCLE_OPTIONS}
                            value={LIFECYCLE_OPTIONS.find(
                                (option) => option.value === statusFilter,
                            )}
                            onChange={(option) => {
                                const value = option?.value ?? 'all'
                                onStatusFilterChange(
                                    value as 'all' | ProductLifecycleStatus,
                                )
                                setPage(1)
                            }}
                        />
                    </div>
                </div>
            ) : null}

            {selectedIds.size > 0 ? (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedIds.size} selected
                    </span>
                    <Button
                        size="xs"
                        className="ml-auto"
                        onClick={() => setSelectedIds(new Set())}
                    >
                        Clear
                    </Button>
                </div>
            ) : null}

            <SdDataTable
                    columns={columns}
                    data={pagedProducts}
                    loading={(loading || stockLoading || refreshing) && products.length === 0}
                    noData={!loading && products.length === 0}
                    selectable
                    checkboxChecked={(row) => selectedIds.has(row.id)}
                    onCheckBoxChange={handleCheckBoxChange}
                    onIndeterminateCheckBoxChange={(checked, rows) =>
                        handleSelectAllChange(checked, rows as { original: SdProductRecord }[])
                    }
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                    onSort={handleSort}
                    getRowId={(row) => row.id}
                    renderSubRow={(row) => (
                        <div className="animate-mm-row-in motion-reduce:animate-none">
                            <ProductVariantsSubRow
                                productId={row.id}
                                productName={row.name}
                                companyId={row.company?.id ?? null}
                                parentPrice={row.price}
                                canUpdate={canUpdate}
                                onAddVariant={
                                    onAddVariant ? () => onAddVariant(row) : undefined
                                }
                            />
                        </div>
                    )}
                />
        </AdaptiveCard>
    )
}

export default ProductCatalogTableSection
