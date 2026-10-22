'use client'

import { useEffect, useMemo, useState } from 'react'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    effectiveVariantPrice,
    type ProductVariantDefinition,
} from '@/modules/sd/services/productOptionVariantsService'
import type { CartVariantInfo } from '@/modules/storefront/shared/store/createStorefrontCartStore'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    SellerTag,
    formatPrice,
} from '../../marketplaceUi'
import MaterialVariantCards, {
    isVariantSoldOut,
} from './MaterialVariantCards'
import { useProductVariantsAvailability } from './useProductVariantsAvailability'

const MAX_QUANTITY = 99

export type StorefrontVariantPickDialogProps = {
    isOpen: boolean
    product: SdProductRecord
    variants: ProductVariantDefinition[]
    initialVariantId?: string | null
    buyNow?: boolean
    onClose: () => void
    onConfirm: (
        variant: ProductVariantDefinition,
        quantity: number,
        variantInfo: CartVariantInfo,
    ) => void
}

const StorefrontVariantPickDialog = ({
    isOpen,
    product,
    variants,
    initialVariantId,
    buyNow = false,
    onClose,
    onConfirm,
}: StorefrontVariantPickDialogProps) => {
    const sorted = useMemo(
        () =>
            [...variants].sort(
                (a, b) =>
                    Number(b.isDefault) - Number(a.isDefault) ||
                    a.sortOrder - b.sortOrder,
            ),
        [variants],
    )

    const [selectedId, setSelectedId] = useState<string | null>(
        initialVariantId ?? null,
    )
    const [quantity, setQuantity] = useState(1)

    const { byVariantId, loading: stockLoading } = useProductVariantsAvailability(
        product.id,
        isOpen,
    )

    useEffect(() => {
        if (!isOpen) return
        setQuantity(1)
        const preferred =
            (initialVariantId &&
            sorted.some((v) => v.id === initialVariantId)
                ? initialVariantId
                : null) ??
            sorted.find((v) => v.isDefault)?.id ??
            sorted[0]?.id ??
            null
        setSelectedId(preferred)
    }, [isOpen, initialVariantId, sorted])

    useEffect(() => {
        if (!isOpen || stockLoading || !selectedId) return
        if (!isVariantSoldOut(byVariantId.get(selectedId))) return
        const next = sorted.find(
            (v) => !isVariantSoldOut(byVariantId.get(v.id)),
        )
        if (next) setSelectedId(next.id)
    }, [isOpen, stockLoading, selectedId, byVariantId, sorted])

    const selected =
        sorted.find((v) => v.id === selectedId) ??
        sorted.find((v) => !isVariantSoldOut(byVariantId.get(v.id))) ??
        null

    const stock = selected ? byVariantId.get(selected.id) : undefined
    const unlimited = stock?.state === 'NON_INVENTORY'
    const available = stock
        ? Math.max(0, Math.floor(stock.availableQuantity))
        : null
    const soldOut = selected
        ? isVariantSoldOut(stock)
        : true
    const maxQuantity =
        unlimited || available === null
            ? MAX_QUANTITY
            : Math.min(available, MAX_QUANTITY)

    useEffect(() => {
        setQuantity((q) => Math.max(1, Math.min(q, maxQuantity)))
    }, [maxQuantity, selectedId])

    const unitPrice = selected
        ? effectiveVariantPrice(product.price, selected)
        : product.price

    const buildVariantInfo = (
        variant: ProductVariantDefinition,
    ): CartVariantInfo => ({
        variantId: variant.id,
        variantName: variant.variantName,
        variantSku: variant.sku,
        materialId: variant.materialId ?? undefined,
        unitPrice: variant.price ?? product.price,
        companyId: variant.companyId ?? product.company?.id ?? undefined,
        optionValues: variant.optionValues.map((link) => link.value),
    })

    const handleConfirm = () => {
        if (!selected || soldOut) return
        onConfirm(selected, quantity, buildVariantInfo(selected))
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={640}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <div className="mb-4 flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    <ProductImage
                        product={product}
                        fit="cover"
                        sizes="64px"
                        className="h-full w-full"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <SellerTag product={product} />
                    <h5 className="mt-1 text-base font-semibold text-gray-900">
                        {buyNow ? 'Buy now' : 'Add to cart'}
                    </h5>
                    <p className="truncate text-sm text-gray-500">
                        {product.name}
                    </p>
                </div>
            </div>

            <p className="mb-2 text-sm font-medium text-gray-900">Variant</p>

            <div className="max-h-[min(50vh,22rem)] overflow-y-auto pr-1">
                <MaterialVariantCards
                    product={product}
                    variants={sorted}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelectedId}
                    stockByVariantId={byVariantId}
                    stockLoading={stockLoading}
                />
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">Quantity</span>
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            onDecrease={() =>
                                setQuantity((q) => Math.max(1, q - 1))
                            }
                            onIncrease={() =>
                                setQuantity((q) =>
                                    Math.min(maxQuantity, q + 1),
                                )
                            }
                        />
                    </div>
                    <p className="text-sm text-gray-500">
                        Subtotal{' '}
                        <span className="font-semibold text-gray-900">
                            {formatPrice(unitPrice * quantity)}
                        </span>
                    </p>
                </div>

                <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className={classNames(PRIMARY_BUTTON_CLASS, '!px-5')}
                        customColorClass={PRIMARY_BUTTON}
                        icon={
                            buyNow ? undefined : (
                                <HiOutlineShoppingCart className="text-lg" />
                            )
                        }
                        disabled={!selected || soldOut || stockLoading}
                        onClick={handleConfirm}
                    >
                        {soldOut
                            ? 'Out of stock'
                            : buyNow
                              ? 'Continue to checkout'
                              : 'Add to cart'}
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default StorefrontVariantPickDialog
