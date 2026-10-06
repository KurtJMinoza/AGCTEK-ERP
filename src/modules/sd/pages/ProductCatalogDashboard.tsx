'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ProductFormDialog from '../components/ProductFormDialog'
import ProductCatalogTableSection from '../components/ProductCatalogTableSection'
import { PRODUCT_DIVISIONS, productDivisionLabel } from '../catalogs/productDivisions'
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

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
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

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Product Catalog"
                description="Products and prices sold on the AWIC, LPG and MCONPINCO storefronts and the POS."
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <ProductCatalogTableSection
                products={products}
                loading={loading}
                refreshing={loading && products.length > 0}
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                divisionFilter={divisionFilter}
                onDivisionFilterChange={setDivisionFilter}
                togglingId={togglingId}
                onToggleActive={toggleActive}
                onEdit={(product) => setDialog({ mode: 'edit', product })}
                onDelete={setPendingDelete}
                onAddProduct={() => setDialog({ mode: 'create' })}
                onRefresh={() => void fetchProducts()}
            />

            <ProductFormDialog
                isOpen={dialog !== null}
                mode={dialog?.mode ?? 'create'}
                product={dialog?.mode === 'edit' ? dialog.product : null}
                defaultDivisionId={
                    divisionFilter === 'all'
                        ? PRODUCT_DIVISIONS[0]?.id ?? ''
                        : divisionFilter
                }
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
