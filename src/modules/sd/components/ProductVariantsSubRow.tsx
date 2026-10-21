'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HiOutlineArchive } from 'react-icons/hi'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { MM_MATERIALS_SKUS_PATH } from '@/utils/erp-path'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { archiveVariant } from '../services/productCatalogService'
import {
    productOptionVariantsService,
    type ProductVariantDefinition,
    type VariantStockAvailability,
} from '../services/productOptionVariantsService'

type Props = {
    productId: string
    productName: string
    /** Company scope of the catalog row. */
    companyId?: string | null
    /** Parent product price — used when a variant inherits it. */
    parentPrice: number
}

const money = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(value)

const STATE_LABEL: Record<string, string> = {
    IN_STOCK: 'In stock',
    LOW_STOCK: 'Low stock',
    OUT_OF_STOCK: 'Out of stock',
    NOT_MAPPED: 'No material linked',
    INACTIVE: 'Inactive',
}

const STATE_CLASS: Record<string, string> = {
    IN_STOCK:
        'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    LOW_STOCK:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
    OUT_OF_STOCK:
        'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    NOT_MAPPED:
        'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    INACTIVE: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

/**
 * Product Catalog → Variants.
 *
 * Every variant owns exactly one Material Master and therefore has its own
 * stock. All quantities are read from Materials Management (the ledger) and
 * are read-only here — the Product Catalog never owns stock.
 */
const ProductVariantsSubRow = ({
    productId,
    productName,
    companyId,
    parentPrice,
}: Props) => {
    const [variants, setVariants] = useState<ProductVariantDefinition[]>([])
    const [stock, setStock] = useState<Record<string, VariantStockAvailability>>(
        {},
    )
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pendingArchive, setPendingArchive] =
        useState<ProductVariantDefinition | null>(null)
    const [archiving, setArchiving] = useState(false)
    const { canUpdate } = useResourceAccess('sd.product-catalog')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        Promise.all([
            productOptionVariantsService.getForProduct(productId),
            productOptionVariantsService
                .productVariantsAvailability(productId, companyId ?? undefined)
                .catch(() => [] as VariantStockAvailability[]),
        ])
            .then(([payload, availability]) => {
                if (cancelled) return
                setVariants(payload.variants ?? [])
                setStock(
                    Object.fromEntries(
                        (availability ?? []).map((row) => [row.variantId, row]),
                    ),
                )
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Unable to load the variants for this product.')
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [productId, companyId])

    const rows = useMemo(
        () =>
            variants.map((variant) => ({
                variant,
                stock: stock[variant.id],
            })),
        [variants, stock],
    )

    /** Archive a variant: hidden from the shop, stock and history preserved. */
    const confirmArchive = async () => {
        if (!pendingArchive) return
        setArchiving(true)
        try {
            await archiveVariant(pendingArchive.id)
            setVariants((current) =>
                current.map((variant) =>
                    variant.id === pendingArchive.id
                        ? { ...variant, isActive: false }
                        : variant,
                ),
            )
            setPendingArchive(null)
        } catch {
            setError('Unable to archive the variant. Please try again.')
        } finally {
            setArchiving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500">
                <Spinner size="sm" /> Loading variants…
            </div>
        )
    }

    if (error) {
        return (
            <div className="px-4 py-4 text-sm text-red-600">{error}</div>
        )
    }

    if (rows.length === 0) {
        return (
            <div className="px-4 py-4 text-sm text-gray-500">
                {productName} has no variants.
            </div>
        )
    }

    return (
        <div className="space-y-2 px-2 py-3">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Variants
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="py-2 pr-3">Variant</th>
                            <th className="py-2 pr-3">Material</th>
                            <th className="py-2 pr-3 text-right">Price</th>
                            <th className="py-2 pr-3 text-right">On hand</th>
                            <th className="py-2 pr-3 text-right">Reserved</th>
                            <th className="py-2 pr-3 text-right">Available</th>
                            <th className="py-2">Stock</th>
                            <th className="py-2 pr-2 text-right">
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ variant, stock: availability }) => {
                            const materialId = variant.materialId
                            const materialCode =
                                availability?.materialCode ?? null
                            const onHand = availability?.physicalStock ?? 0
                            const reserved = availability?.reservedQuantity ?? 0
                            const available = availability?.availableQuantity ?? 0
                            const state = availability?.state ?? 'NOT_MAPPED'
                            return (
                                <tr
                                    key={variant.id}
                                    className="border-t border-gray-100 dark:border-gray-800"
                                >
                                    <td className="py-2 pr-3">
                                        <span className="font-medium text-gray-900">
                                            {variant.variantName}
                                        </span>
                                        <span className="ml-2 text-xs text-gray-500">
                                            {variant.sku}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-3">
                                        {materialId ? (
                                            <Link
                                                href={`${MM_MATERIALS_SKUS_PATH}/${materialId}`}
                                                className="font-medium text-primary-600 hover:underline"
                                            >
                                                {materialCode ?? 'Open material'}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400">
                                                —
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-gray-900">
                                        {money(
                                            variant.price ?? parentPrice ?? 0,
                                        )}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-gray-700">
                                        {onHand}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-gray-700">
                                        {reserved}
                                    </td>
                                    <td className="py-2 pr-3 text-right font-semibold text-gray-900">
                                        {available}
                                    </td>
                                    <td className="py-2">
                                        <span
                                            className={`inline-flex rounded-md border border-transparent px-2 py-0.5 text-xs font-medium ${
                                                STATE_CLASS[state] ??
                                                STATE_CLASS.INACTIVE
                                            }`}
                                        >
                                            {STATE_LABEL[state] ?? state}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {materialId ? (
                                                <Link
                                                    href={`${MM_MATERIALS_SKUS_PATH}/${materialId}`}
                                                    className="text-xs font-medium text-primary-600 hover:underline"
                                                >
                                                    Open in MM
                                                </Link>
                                            ) : null}
                                            {canUpdate &&
                                            variant.isActive &&
                                            !variant.isHidden ? (
                                                <Button
                                                    size="sm"
                                                    variant="plain"
                                                    className="text-gray-500 hover:text-rose-600"
                                                    icon={
                                                        <HiOutlineArchive className="text-lg" />
                                                    }
                                                    aria-label={`Archive variant ${variant.variantName}`}
                                                    onClick={() =>
                                                        setPendingArchive(variant)
                                                    }
                                                />
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-2 text-xs text-gray-500">
                Stock is read from Materials Management and is read-only here.
                Add stock through a goods receipt, opening inventory, adjustment
                or stock transfer.
            </p>
            <ConfirmDialog
                isOpen={!!pendingArchive}
                type="warning"
                title="Archive variant"
                confirmText="Archive"
                confirmButtonProps={{ loading: archiving }}
                onConfirm={() => void confirmArchive()}
                onCancel={() => setPendingArchive(null)}
            >
                {pendingArchive
                    ? `Archive "${pendingArchive.variantName}"? It will be hidden from the shop and can no longer be ordered. Its material, stock and order history are preserved.`
                    : ''}
            </ConfirmDialog>
        </div>
    )
}

export default ProductVariantsSubRow
