'use client'

import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    effectiveVariantPrice,
    type ProductVariantDefinition,
    type VariantStockAvailability,
    variantLabel,
} from '@/modules/sd/services/productOptionVariantsService'
import { formatPrice } from '../../marketplaceUi'
import VariantStockBadge from './VariantStockBadge'

export type MaterialVariantCardsProps = {
    product: SdProductRecord
    variants: ProductVariantDefinition[]
    selectedId: string | null
    onSelect: (variantId: string) => void
    stockByVariantId: Map<string, VariantStockAvailability>
    stockLoading?: boolean
    disableUnavailable?: boolean
}

const isVariantSoldOut = (stock: VariantStockAvailability | undefined) => {
    if (!stock || stock.state === 'NON_INVENTORY') return false
    const available = Math.max(0, Math.floor(stock.availableQuantity))
    return (
        stock.state === 'OUT_OF_STOCK' ||
        stock.state === 'NOT_MAPPED' ||
        available <= 0
    )
}

const MaterialVariantCards = ({
    product,
    variants,
    selectedId,
    onSelect,
    stockByVariantId,
    stockLoading = false,
    disableUnavailable = true,
}: MaterialVariantCardsProps) => {
    return (
        <ul
            className="divide-y divide-gray-100 rounded-lg border border-gray-200"
            role="radiogroup"
            aria-label="Product variants"
        >
            {variants.map((variant) => {
                const selected = variant.id === selectedId
                const stock = stockByVariantId.get(variant.id)
                const soldOut = isVariantSoldOut(stock)
                const disabled = disableUnavailable && soldOut
                const label = variantLabel(variant)
                const subtitle =
                    stock?.materialName?.trim() &&
                    stock.materialName.trim() !== label
                        ? stock.materialName.trim()
                        : null
                const price = effectiveVariantPrice(product.price, variant)

                return (
                    <li key={variant.id}>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => onSelect(variant.id)}
                            className={classNames(
                                'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900',
                                disabled
                                    ? 'cursor-not-allowed opacity-45'
                                    : 'hover:bg-gray-50/80',
                                selected ? 'bg-gray-50' : 'bg-white',
                            )}
                        >
                            <span
                                className={classNames(
                                    'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-[10px] font-medium uppercase tracking-wide text-gray-400',
                                )}
                                aria-hidden
                            >
                                {variant.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={variant.imageUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    label.slice(0, 2)
                                )}
                            </span>

                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-gray-900">
                                    {label}
                                </span>
                                {subtitle ? (
                                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                                        {subtitle}
                                    </span>
                                ) : null}
                            </span>

                            <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                                <span className="text-sm font-medium tabular-nums text-gray-900">
                                    {formatPrice(price)}
                                </span>
                                <VariantStockBadge
                                    stock={stock}
                                    loading={stockLoading}
                                    compact
                                    minimal
                                />
                            </span>

                            <span
                                className={classNames(
                                    'ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                    selected
                                        ? 'border-gray-900 bg-gray-900'
                                        : 'border-gray-300 bg-white',
                                )}
                                aria-hidden
                            >
                                {selected ? (
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                ) : null}
                            </span>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

export { isVariantSoldOut }
export default MaterialVariantCards
