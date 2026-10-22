'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import AddVariantDialog from '../components/AddVariantDialog'
import ProductCatalogTableSection from '../components/ProductCatalogTableSection'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { productSellerLabel } from '../utils/productSellerLabel'
import { productOptionVariantsService } from '../services/productOptionVariantsService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import {
    createProduct,
    createProductFamily,
    deleteProduct,
    listProducts,
    setProductStatus,
    updateProduct,
    type CreateProductFamilyInput,
    type ProductInput,
    type ProductLifecycleStatus,
    type SdProductRecord,
} from '../services/productCatalogService'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

/**
 * Converts the generic ProductInput (form output) into the typed
 * CreateProductFamilyInput for the unified family endpoint. Returns null
 * if the required material-defaults information is unavailable.
 *
 * The family endpoint creates the parent product, its options, its variants
 * and one Material Master per variant in a single transaction — the parent
 * product itself never holds stock.
 */
function buildFamilyInput(values: ProductInput): CreateProductFamilyInput | null {
    const ov = values.optionsVariants
    if (!values.companyId) return null
    const productConfig = values.productConfig ?? 'SIMPLE'
    const existingMaterialId = values.materialId?.trim() || undefined

    if (productConfig === 'VARIABLE') {
        // Every configured variant must link an existing material.
        if (!ov || !ov.options.length || !ov.variants.length) return null
        const enabled = ov.variants.filter((v) => v.isActive !== false)
        if (enabled.length === 0) return null
        if (enabled.some((v) => !v.materialId)) return null
    } else {
        // A simple product links exactly one existing material.
        if (!existingMaterialId) return null
    }

    return {
        divisionId: values.divisionId,
        name: values.name,
        description: values.description,
        price: values.price,
        originalPrice: values.originalPrice ?? undefined,
        imageUrl: values.imageUrl,
        badge: values.badge ?? undefined,
        productConfig,
        sku: values.sku || undefined,
        materialDefaults: { companyId: values.companyId },
        ...(existingMaterialId ? { existingMaterialId } : {}),
        options: (ov?.options ?? []).map((opt, i) => ({
            name: opt.name,
            displayStyle: opt.displayStyle ?? 'BUTTON',
            isRequired: opt.isRequired,
            sortOrder: i,
            values: opt.values.map((v, vi) => ({
                value: v.value,
                swatchColor: v.swatchColor ?? undefined,
                imageUrl: v.imageUrl ?? undefined,
                sortOrder: vi,
            })),
        })),
        variants: (ov?.variants ?? []).map((v) => ({
            enabled: v.isActive !== false,
            sku: v.sku || undefined,
            barcode: v.barcode ?? undefined,
            price: v.price ?? undefined,
            compareAtPrice: v.compareAtPrice ?? undefined,
            imageUrl: v.imageUrl ?? undefined,
            weight: v.weight ?? undefined,
            optionValues: v.optionValues,
            existingMaterialId: v.materialId ?? undefined,
        })),
    }
}

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
    const searchParams = useSearchParams()

    const [products, setProducts] = useState<SdProductRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [companyFilter, setCompanyFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState<'all' | ProductLifecycleStatus>(
        'all',
    )
    const [companies, setCompanies] = useState<
        { id: string; name: string; code: string }[]
    >([])
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [dialog, setDialog] = useState<DialogState>(null)
    const [saving, setSaving] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<SdProductRecord | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteBlocked, setDeleteBlocked] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const [addVariantProduct, setAddVariantProduct] = useState<SdProductRecord | null>(null)

    const fetchProducts = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setProducts(
                await listProducts({
                    companyId: companyFilter === 'all' ? undefined : companyFilter,
                    status: statusFilter === 'all' ? undefined : statusFilter,
                    search,
                }),
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load products.')
        } finally {
            setLoading(false)
        }
    }, [companyFilter, search, statusFilter])

    useEffect(() => {
        void fetchProducts()
    }, [fetchProducts])

    useEffect(() => {
        orgService
            .companies()
            .then((rows) =>
                setCompanies(
                    rows.map((c) => ({ id: c.id, name: c.name, code: c.code })),
                ),
            )
            .catch(() => setCompanies([]))
    }, [])

    const companyFilterOptions = useMemo(
        () => [
            { value: 'all', label: 'All companies' },
            ...companies
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
        ],
        [companies],
    )

    useEffect(() => {
        if (searchInput.trim() === search) return
        const timer = window.setTimeout(
            () => setSearch(searchInput.trim()),
            SEARCH_DEBOUNCE_MS,
        )
        return () => window.clearTimeout(timer)
    }, [searchInput, search])

    /**
     * Deep link from Materials Management: /product-catalog?sku=RET-PRD-000001
     * seeds the search so the linked parent product is on screen.
     */
    useEffect(() => {
        const sku = searchParams.get('sku')?.trim()
        if (!sku) return
        setSearchInput(sku)
        setSearch(sku)
    }, [searchParams])

    const afterChange = (...divisionIds: string[]) => {
        divisionIds.forEach(invalidateStorefront)
        void fetchProducts()
    }

    const handleSubmit = async (values: ProductInput) => {
        if (!dialog) return
        setSaving(true)
        try {
            if (dialog.mode === 'create') {
                // The unified family endpoint creates the parent product, its
                // options, its variants and one Material Master per variant in
                // a single transaction. Simple products get one hidden default
                // variant through the same endpoint.
                if (values.companyId) {
                    const familyInput = buildFamilyInput(values)
                    if (familyInput) {
                        const created = await createProductFamily(familyInput)
                        const enabledVariants =
                            familyInput.variants?.filter((v) => v.enabled) ??
                            []
                        const variantCount =
                            familyInput.productConfig === 'SIMPLE'
                                ? 1
                                : enabledVariants.length
                        const materialCount =
                            familyInput.productConfig === 'SIMPLE'
                                ? 1
                                : enabledVariants.filter(
                                      (v) => !!v.existingMaterialId,
                                  ).length
                        notify(
                            'success',
                            'Product added',
                            `${created.name} with ${variantCount} variant(s) linked to ${materialCount} existing material(s) is now listed.`,
                        )
                        afterChange(created.divisionId ?? values.divisionId)
                        setDialog(null)
                        setSaving(false)
                        return
                    }
                }
                // Fallback: simple products or when family input can't be built
                const created = await createProduct(values)
                if (values.optionsVariants) {
                    try {
                        await productOptionVariantsService.saveForProduct(
                            created.id,
                            values.optionsVariants,
                        )
                    } catch (optionErr) {
                        afterChange(created.divisionId)
                        setDialog(null)
                        notify(
                            'danger',
                            'Product added, but options & variants failed',
                            optionErr instanceof Error
                                ? optionErr.message
                                : 'Open the product and retry the Options & Variants step.',
                        )
                        return
                    }
                }
                notify(
                    'success',
                    'Product added',
                    `${created.name} is now listed for ${productSellerLabel(created)}.`,
                )
                afterChange(created.divisionId)
            } else {
                const { divisionId: _divisionId, sku: _sku, ...changes } = values
                const updated = await updateProduct(dialog.product.id, changes)
                if (values.optionsVariants) {
                    try {
                        await productOptionVariantsService.saveForProduct(
                            dialog.product.id,
                            values.optionsVariants,
                        )
                    } catch (optionErr) {
                        // The product itself was saved — say so, instead of
                        // reporting "Product not updated" for a saved product.
                        afterChange(updated.divisionId)
                        setDialog(null)
                        notify(
                            'danger',
                            'Product updated, but options & variants failed',
                            optionErr instanceof Error
                                ? optionErr.message
                                : 'Open the product and retry the Options & Variants step.',
                        )
                        return
                    }
                }
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
                const updated = await setProductStatus(
                    product.id,
                    isActive ? 'ACTIVE' : 'INACTIVE',
                )
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
            const message =
                err instanceof Error ? err.message : 'Please try again.'
            const blocked = message.includes('cannot be deleted because')
            setDeleteBlocked(blocked)
            notify(
                'danger',
                'Product not deleted',
                message,
            )
        } finally {
            setDeleting(false)
        }
    }

    const archivePendingProduct = async () => {
        if (!pendingDelete) return
        setDeleting(true)
        try {
            const updated = await setProductStatus(pendingDelete.id, 'ARCHIVED')
            notify(
                'success',
                'Product archived',
                `${updated.name} is hidden from the shop and new orders while its history remains intact.`,
            )
            afterChange(updated.divisionId)
            setPendingDelete(null)
            setDeleteBlocked(false)
        } catch (err) {
            notify(
                'danger',
                'Product not archived',
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
                companyFilter={companyFilter}
                onCompanyFilterChange={setCompanyFilter}
                companyFilterOptions={companyFilterOptions}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                togglingId={togglingId}
                onToggleActive={toggleActive}
                onEdit={(product) => setDialog({ mode: 'edit', product })}
                onDelete={(product) => {
                    setDeleteBlocked(false)
                    setPendingDelete(product)
                }}
                onAddProduct={() => setDialog({ mode: 'create' })}
                onAddVariant={(product) => setAddVariantProduct(product)}
                onRefresh={() => void fetchProducts()}
            />

            <ProductFormDialog
                isOpen={dialog !== null}
                mode={dialog?.mode ?? 'create'}
                product={dialog?.mode === 'edit' ? dialog.product : null}
                defaultDivisionId={RETAIL_DIVISION_ID}
                saving={saving}
                onClose={() => setDialog(null)}
                onSubmit={handleSubmit}
            />

            {addVariantProduct ? (
                <AddVariantDialog
                    isOpen={addVariantProduct !== null}
                    product={addVariantProduct}
                    onClose={() => setAddVariantProduct(null)}
                    onSuccess={() => {
                        afterChange(addVariantProduct.divisionId)
                    }}
                />
            ) : null}

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                type="danger"
                title="Delete product?"
                confirmText={deleteBlocked ? 'Archive product' : 'Delete'}
                cancelText="Cancel"
                confirmButtonProps={{ loading: deleting }}
                onClose={() => {
                    setPendingDelete(null)
                    setDeleteBlocked(false)
                }}
                onRequestClose={() => {
                    setPendingDelete(null)
                    setDeleteBlocked(false)
                }}
                onCancel={() => {
                    setPendingDelete(null)
                    setDeleteBlocked(false)
                }}
                onConfirm={() =>
                    void (deleteBlocked ? archivePendingProduct() : confirmDelete())
                }
            >
                {deleteBlocked ? (
                    <p>
                        This product is already used in transactions. It cannot be
                        deleted; archive it instead to hide it from the shop and new
                        orders while retaining its history.
                    </p>
                ) : (
                    <p>
                        {pendingDelete?.name} ({pendingDelete?.sku}) will be removed
                        from {pendingDelete ? productSellerLabel(pendingDelete) : ''}{' '}
                        and can no longer be sold. Used products will be offered an
                        Archive action instead.
                    </p>
                )}
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ProductCatalogDashboard
