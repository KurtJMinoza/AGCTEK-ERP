'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineCube,
    HiOutlinePencil,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import ProductFormDialog from '../components/ProductFormDialog'
import {
    PRODUCT_DIVISIONS,
    productDivisionLabel,
} from '../catalogs/productDivisions'
import {
    listProducts,
    updateProduct,
    type ProductInput,
    type SdProductRecord,
} from '../services/productCatalogService'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

const ROUTE_PATH = '/modules/sd/product-catalog'
const SEARCH_DEBOUNCE_MS = 350

type FilterOption = { value: string; label: string }

const DIVISION_FILTER_OPTIONS: FilterOption[] = [
    { value: 'all', label: 'All divisions' },
    ...PRODUCT_DIVISIONS.map((d) => ({ value: d.id, label: d.label })),
]

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(value)

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const SummaryStat = ({
    label,
    value,
}: {
    label: string
    value: string | number
}) => (
    <Card>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 break-words text-xl font-bold sm:text-2xl">
            {value}
        </div>
    </Card>
)

const Thumbnail = ({ src, alt }: { src: string; alt: string }) => (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {isRenderableImageSrc(src) ? (
            <Image
                src={src}
                alt={alt}
                fill
                sizes="48px"
                unoptimized={isUnoptimizedImage(src)}
                className="object-cover"
            />
        ) : (
            <HiOutlineCube className="m-auto h-full w-5 text-gray-400" />
        )}
    </div>
)

const ProductCatalogDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const invalidateStorefront = useProductCatalogStore((s) => s.invalidate)

    const [products, setProducts] = useState<SdProductRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [divisionFilter, setDivisionFilter] = useState('all')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState<SdProductRecord | null>(null)
    const [saving, setSaving] = useState(false)

    const fetchProducts = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setProducts(
                await listProducts({
                    divisionId:
                        divisionFilter === 'all' ? undefined : divisionFilter,
                    search,
                }),
            )
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Unable to load products.',
            )
        } finally {
            setLoading(false)
        }
    }, [divisionFilter, search])

    useEffect(() => {
        void fetchProducts()
    }, [fetchProducts])

    useEffect(() => {
        if (searchInput.trim() === search) return
        const timer = window.setTimeout(
            () => setSearch(searchInput.trim()),
            SEARCH_DEBOUNCE_MS,
        )
        return () => window.clearTimeout(timer)
    }, [searchInput, search])

    const summary = useMemo(
        () => ({
            total: products.length,
            active: products.filter((p) => p.isActive).length,
            hidden: products.filter((p) => !p.isActive).length,
            onSale: products.filter((p) => p.originalPrice !== null).length,
        }),
        [products],
    )

    const handleSubmit = async (
        values: ProductInput,
        image: File | null,
        gallery: File[],
    ) => {
        if (!editing) return
        setSaving(true)
        try {
            const { divisionId: _divisionId, sku: _sku, ...changes } = values
            const updated = await updateProduct(
                editing.id,
                changes,
                image,
                gallery,
            )
            notify('success', 'Product updated', `${updated.name} saved.`)
            invalidateStorefront(updated.divisionId)
            void fetchProducts()
            setEditing(null)
        } catch (err) {
            notify(
                'danger',
                'Product not updated',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<SdProductRecord>[]>(
        () => [
            {
                header: 'Product',
                id: 'product',
                cell: ({ row }) => (
                    <div className="flex min-w-[14rem] items-center gap-3">
                        <Thumbnail
                            src={row.original.imageUrl}
                            alt={row.original.name}
                        />
                        <div className="min-w-0">
                            <div className="font-semibold">
                                {row.original.name}
                            </div>
                            <div className="font-mono text-xs text-gray-500">
                                {row.original.sku}
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                header: 'Division',
                id: 'division',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {productDivisionLabel(row.original.divisionId)}
                    </span>
                ),
            },
            {
                header: 'Category',
                id: 'category',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {row.original.category}
                    </span>
                ),
            },
            {
                header: 'Price',
                id: 'price',
                cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                        <div className="font-semibold">
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
                header: 'Badge',
                id: 'badge',
                cell: ({ row }) =>
                    row.original.badge ? (
                        <Tag className="whitespace-nowrap">
                            {row.original.badge}
                        </Tag>
                    ) : (
                        <span className="text-gray-400">None</span>
                    ),
            },
            {
                header: 'Visible',
                id: 'isActive',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={row.original.isActive ? 'success' : 'default'}
                    >
                        {row.original.isActive ? 'Active' : 'Hidden'}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        className="whitespace-nowrap"
                        icon={<HiOutlinePencil />}
                        onClick={() => setEditing(row.original)}
                    >
                        Edit
                    </Button>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Product Catalog"
                description="Products and prices sold on the AWIC, LPG and MCONPINCO storefronts and the POS."
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void fetchProducts()}
                    >
                        Refresh
                    </Button>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    className="md:max-w-md"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search name, SKU or category..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <div className="md:w-56">
                    <Select<FilterOption>
                        isSearchable={false}
                        options={DIVISION_FILTER_OPTIONS}
                        value={DIVISION_FILTER_OPTIONS.find(
                            (option) => option.value === divisionFilter,
                        )}
                        onChange={(option) =>
                            setDivisionFilter(option?.value ?? 'all')
                        }
                    />
                </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryStat label="Products" value={summary.total} />
                <SummaryStat label="Active" value={summary.active} />
                <SummaryStat label="Hidden" value={summary.hidden} />
                <SummaryStat
                    label="With original price"
                    value={summary.onSale}
                />
            </div>

            <Card>
                <DataTable
                    columns={columns}
                    data={products}
                    loading={loading && products.length === 0}
                    noData={!loading && products.length === 0}
                    hidePagination
                />
            </Card>

            <ProductFormDialog
                isOpen={editing !== null}
                product={editing}
                saving={saving}
                onClose={() => setEditing(null)}
                onSubmit={handleSubmit}
            />
        </PageContainer>
    )
}

export default ProductCatalogDashboard
