'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineCube,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTrash,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
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
    createProduct,
    deleteProduct,
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
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const SummaryStat = ({ label, value }: { label: string; value: string | number }) => (
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

type DialogState =
    | { mode: 'create' }
    | { mode: 'edit'; product: SdProductRecord }
    | null

const ProductCatalogDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const invalidateStorefront = useProductCatalogStore((s) => s.invalidate)

    const [products, setProducts] = useState<SdProductRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [divisionFilter, setDivisionFilter] = useState('all')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [dialog, setDialog] = useState<DialogState>(null)
    const [saving, setSaving] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<SdProductRecord | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    const fetchProducts = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setProducts(
                await listProducts({
                    divisionId: divisionFilter === 'all' ? undefined : divisionFilter,
                    search,
                }),
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load products.')
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

    const afterChange = (...divisionIds: string[]) => {
        divisionIds.forEach(invalidateStorefront)
        void fetchProducts()
    }

    const handleSubmit = async (values: ProductInput) => {
        if (!dialog) return
        setSaving(true)
        try {
            if (dialog.mode === 'create') {
                const created = await createProduct(values)
                notify(
                    'success',
                    'Product added',
                    `${created.name} is now listed on ${productDivisionLabel(created.divisionId)}.`,
                )
                afterChange(created.divisionId)
            } else {
                const { divisionId: _divisionId, sku: _sku, ...changes } = values
                const updated = await updateProduct(dialog.product.id, changes)
                notify('success', 'Product updated', `${updated.name} saved.`)
                afterChange(updated.divisionId)
            }
            setDialog(null)
        } catch (err) {
            notify(
                'danger',
                dialog.mode === 'create' ? 'Product not added' : 'Product not updated',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = useCallback(
        async (product: SdProductRecord, isActive: boolean) => {
            setTogglingId(product.id)
            try {
                const updated = await updateProduct(product.id, { isActive })
                setProducts((rows) =>
                    rows.map((row) => (row.id === updated.id ? updated : row)),
                )
                invalidateStorefront(updated.divisionId)
            } catch (err) {
                notify(
                    'danger',
                    'Status not changed',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setTogglingId(null)
            }
        },
        [invalidateStorefront],
    )

    const confirmDelete = async () => {
        if (!pendingDelete) return
        setDeleting(true)
        try {
            await deleteProduct(pendingDelete.id)
            notify('success', 'Product deleted', `${pendingDelete.name} was removed.`)
            afterChange(pendingDelete.divisionId)
            setPendingDelete(null)
        } catch (err) {
            notify(
                'danger',
                'Product not deleted',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setDeleting(false)
        }
    }

    const columns = useMemo<ColumnDef<SdProductRecord>[]>(
        () => [
            {
                header: 'Product',
                id: 'product',
                cell: ({ row }) => (
                    <div className="flex min-w-[14rem] items-center gap-3">
                        <Thumbnail src={row.original.imageUrl} alt={row.original.name} />
                        <div className="min-w-0">
                            <div className="font-semibold">{row.original.name}</div>
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
                    <span className="whitespace-nowrap">{row.original.category}</span>
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
                        <Tag className="whitespace-nowrap">{row.original.badge}</Tag>
                    ) : (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Visible',
                id: 'isActive',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <Switcher
                            checked={row.original.isActive}
                            isLoading={togglingId === row.original.id}
                            onChange={(checked) => void toggleActive(row.original, checked)}
                        />
                        <span className="text-xs text-gray-500">
                            {row.original.isActive ? 'Active' : 'Hidden'}
                        </span>
                    </div>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <Button
                            size="xs"
                            className="whitespace-nowrap"
                            icon={<HiOutlinePencil />}
                            onClick={() =>
                                setDialog({ mode: 'edit', product: row.original })
                            }
                        >
                            Edit
                        </Button>
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineTrash />}
                            aria-label={`Delete ${row.original.name}`}
                            onClick={() => setPendingDelete(row.original)}
                        />
                    </div>
                ),
            },
        ],
        [togglingId, toggleActive],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Product Catalog"
                description="Products and prices sold on the AWIC, LPG and MCONPINCO storefronts and the POS."
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={() => void fetchProducts()}
                        >
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={() => setDialog({ mode: 'create' })}
                        >
                            Add New Product
                        </Button>
                    </div>
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
                        onChange={(option) => setDivisionFilter(option?.value ?? 'all')}
                    />
                </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryStat label="Products" value={summary.total} />
                <SummaryStat label="Active" value={summary.active} />
                <SummaryStat label="Hidden" value={summary.hidden} />
                <SummaryStat label="With original price" value={summary.onSale} />
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
                isOpen={dialog !== null}
                mode={dialog?.mode ?? 'create'}
                product={dialog?.mode === 'edit' ? dialog.product : null}
                defaultDivisionId={divisionFilter === 'all' ? '' : divisionFilter}
                saving={saving}
                onClose={() => setDialog(null)}
                onSubmit={handleSubmit}
            />

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                type="danger"
                title="Delete product?"
                confirmText="Delete"
                cancelText="Cancel"
                confirmButtonProps={{ loading: deleting }}
                onClose={() => setPendingDelete(null)}
                onRequestClose={() => setPendingDelete(null)}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => void confirmDelete()}
            >
                <p>
                    {pendingDelete?.name} ({pendingDelete?.sku}) will be removed from{' '}
                    {pendingDelete ? productDivisionLabel(pendingDelete.divisionId) : ''}{' '}
                    and can no longer be sold. To hide it temporarily, switch it off
                    under Visible instead.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ProductCatalogDashboard
