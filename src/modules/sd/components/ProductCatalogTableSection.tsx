'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineCube,
    HiOutlineFilter,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineRefresh,
    HiOutlineUpload,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef, type OnSortParam } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import {
    fetchProductCatalogStock,
    type SdProductRecord,
} from '../services/productCatalogService'
import type { CatalogStockSnapshot } from '../utils/productCatalogTableColors'
import { downloadProductCatalogCsv } from '../utils/productCatalogExport'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    badgeTextClass,
    categoryTextClass,
    priceTextClass,
    stockBarClass,
    stockLabel,
    stockPercent,
    stockTextClass,
    visibilityTextClass,
} from '../utils/productCatalogTableColors'

type FilterOption = { value: string; label: string }

const CompanyLogoCell = ({
    company,
}: {
    company: { name: string; logoUrl: string | null }
}) => {
    const src = company.logoUrl?.trim() ?? ''
    return (
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700">
            {isRenderableImageSrc(src) ? (
                <Image
                    src={src}
                    alt=""
                    fill
                    sizes="32px"
                    unoptimized={isUnoptimizedImage(src)}
                    className="object-contain p-0.5"
                />
            ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-gray-400">
                    {(company.name ?? '').slice(0, 2) || '?'}
                </span>
            )}
        </div>
    )
}

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

const HeaderLabel = ({ children }: { children: string }) => (
    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {children}
    </span>
)

const Thumbnail = ({ src, alt }: { src: string; alt: string }) => (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {isRenderableImageSrc(src) ? (
            <Image
                src={src}
                alt={alt}
                fill
                sizes="44px"
                unoptimized={isUnoptimizedImage(src)}
                className="object-cover"
            />
        ) : (
            <HiOutlineCube className="m-auto h-full w-5 text-gray-400" />
        )}
    </div>
)

const StockRemainingMeter = ({
    snapshot,
}: {
    snapshot: CatalogStockSnapshot | undefined
}) => {
    const label = stockLabel(snapshot)
    const state = snapshot?.state ?? 'NOT_MAPPED'
    return (
        <div className="min-w-[7rem]">
            <p
                className={`mb-1.5 text-sm font-semibold ${stockTextClass(state)}`}
            >
                {label}
            </p>
            <Progress
                percent={stockPercent(snapshot)}
                showInfo={false}
                customColorClass={stockBarClass(state)}
            />
        </div>
    )
}

const VisibilityMeter = ({ active }: { active: boolean }) => {
    const percent = active ? 100 : 18
    return (
        <div className="min-w-[7rem]">
            <p
                className={`mb-1.5 text-sm font-medium ${visibilityTextClass(active)}`}
            >
                {active ? 'Storefront live' : 'Hidden'}
            </p>
            <Progress
                percent={percent}
                showInfo={false}
                customColorClass={active ? 'bg-emerald-500' : 'bg-rose-400'}
            />
        </div>
    )
}

export type ProductCatalogTableSectionProps = {
    products: SdProductRecord[]
    loading: boolean
    searchInput: string
    onSearchInputChange: (value: string) => void
    companyFilter: string
    onCompanyFilterChange: (value: string) => void
    companyFilterOptions: FilterOption[]
    togglingId: string | null
    onToggleActive: (product: SdProductRecord, isActive: boolean) => void
    onEdit: (product: SdProductRecord) => void
    onDelete: (product: SdProductRecord) => void
    onAddProduct: () => void
    onRefresh?: () => void
    refreshing?: boolean
}

const ProductCatalogTableSection = ({
    products,
    loading,
    searchInput,
    onSearchInputChange,
    companyFilter,
    onCompanyFilterChange,
    companyFilterOptions,
    togglingId,
    onToggleActive,
    onEdit,
    onDelete,
    onAddProduct,
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

    useEffect(() => {
        if (!products.length) {
            setStockByProductId({})
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
                    const qty = (id: string) => stockByProductId[id]?.availableQty ?? -1
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
                header: () => <HeaderLabel>Product</HeaderLabel>,
                enableSorting: true,
                size: 280,
                cell: ({ row }) => (
                    <div className="flex min-w-[12rem] items-center gap-3 py-1">
                        <Thumbnail
                            src={row.original.imageUrl}
                            alt={row.original.name}
                        />
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-gray-900 dark:text-gray-100">
                                {row.original.name}
                            </div>
                            <div className="truncate text-xs text-gray-500">
                                ID: {row.original.sku}
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: 'company',
                header: () => <HeaderLabel>Company</HeaderLabel>,
                enableSorting: true,
                size: 180,
                cell: ({ row }) => {
                    const company = row.original.company
                    if (!company) {
                        return (
                            <span className="text-sm text-gray-400">
                                Not linked to MM
                            </span>
                        )
                    }
                    return (
                        <div className="flex min-w-0 items-center gap-2.5">
                            <CompanyLogoCell company={company} />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {company.name}
                                </div>
                                <div className="truncate text-xs text-gray-500">
                                    {company.code}
                                </div>
                            </div>
                        </div>
                    )
                },
            },
            {
                id: 'category',
                header: () => <HeaderLabel>Category</HeaderLabel>,
                enableSorting: true,
                size: 130,
                cell: ({ row }) => (
                    <span
                        className={`whitespace-nowrap text-sm font-medium ${categoryTextClass(row.original.category)}`}
                    >
                        {row.original.category}
                    </span>
                ),
            },
            {
                id: 'price',
                header: () => <HeaderLabel>Price</HeaderLabel>,
                enableSorting: true,
                size: 120,
                cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                        <div
                            className={`font-semibold ${priceTextClass(row.original)}`}
                        >
                            {formatPrice(row.original.price)}
                        </div>
                        {row.original.originalPrice !== null ? (
                            <div className="text-xs text-gray-400 line-through">
                                {formatPrice(row.original.originalPrice)}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                id: 'stock',
                header: () => <HeaderLabel>Stock remaining</HeaderLabel>,
                enableSorting: true,
                size: 160,
                cell: ({ row }) => (
                    <StockRemainingMeter
                        snapshot={stockByProductId[row.original.id]}
                    />
                ),
            },
            {
                id: 'badge',
                header: () => <HeaderLabel>Badge</HeaderLabel>,
                enableSorting: true,
                size: 110,
                cell: ({ row }) =>
                    row.original.badge ? (
                        <Tag
                            className={`whitespace-nowrap ${badgeTextClass()}`}
                        >
                            {row.original.badge}
                        </Tag>
                    ) : (
                        <span className="text-sm text-gray-400">—</span>
                    ),
            },
            {
                id: 'visible',
                header: () => <HeaderLabel>Visible</HeaderLabel>,
                enableSorting: true,
                size: 180,
                cell: ({ row }) => (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <VisibilityMeter active={row.original.isActive} />
                        <Switcher
                            checked={row.original.isActive}
                            isLoading={togglingId === row.original.id}
                            disabled={!canUpdate}
                            onChange={(checked) =>
                                onToggleActive(row.original, checked)
                            }
                        />
                    </div>
                ),
            },
            {
                id: 'actions',
                header: () => <span className="sr-only">Actions</span>,
                size: 88,
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1">
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
        [onDelete, onEdit, onToggleActive, stockByProductId, togglingId, canUpdate, canDelete],
    )

    return (
        <AdaptiveCard className="mt-2 border border-gray-200 shadow-sm dark:border-gray-700">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
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

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <Input
                    className="flex-1"
                    placeholder="Search"
                    value={searchInput}
                    suffix={<HiOutlineSearch className="text-lg text-gray-400" />}
                    onChange={(e) => {
                        onSearchInputChange(e.target.value)
                        setPage(1)
                    }}
                />
                <Button
                    size="sm"
                    className="shrink-0 min-w-[6.5rem]"
                    icon={<HiOutlineFilter />}
                    onClick={() => setFilterOpen((open) => !open)}
                >
                    Filter
                </Button>
            </div>

            {filterOpen ? (
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40 md:max-w-sm">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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

            <DataTable<SdProductRecord>
                className="product-catalog-ecme-table"
                columns={columns}
                data={pagedProducts}
                compact
                fit
                hoverable
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
            />
        </AdaptiveCard>
    )
}

export default ProductCatalogTableSection
