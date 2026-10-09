'use client'

import { useEffect, useMemo, useState } from 'react'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    productOptionVariantsService,
    type ProductOptionDefinition,
    type ProductOptionsVariants,
    type ProductVariantDefinition,
    type VariantImageMode,
    type VariantStockAvailability,
} from '@/modules/sd/services/productOptionVariantsService'

/**
 * Ecommerce product option selector (Size, Color, Bottle Size, Flavor, Pack…).
 * Renders each option with its admin-chosen display style — buttons, dropdown,
 * color swatches, image swatches or tiles. Resolves the exact variant for the
 * current selections, preselects the default variant, disables combinations
 * without an ACTIVE variant and reports per-variant MM availability.
 */
const ProductVariantSelector = ({
    product,
    onVariantChange,
    onHasVariants,
    onVariantImageMode,
}: {
    product: SdProductRecord
    onVariantChange: (variant: ProductVariantDefinition | null) => void
    onHasVariants: (hasVariants: boolean) => void
    onVariantImageMode?: (mode: VariantImageMode) => void
}) => {
    const [payload, setPayload] = useState<ProductOptionsVariants | null>(null)
    const [selection, setSelection] = useState<Record<string, string>>({})
    const [stock, setStock] = useState<VariantStockAvailability | null>(null)

    useEffect(() => {
        let alive = true
        productOptionVariantsService
            .getForProduct(product.id)
            .then((data) => {
                if (!alive) return
                setPayload(data)
                onHasVariants(data.hasVariants)
                onVariantImageMode?.(data.variantImageMode ?? 'replace')
                if (!data.hasVariants) onVariantChange(null)
            })
            .catch(() => {
                if (alive) onHasVariants(false)
            })
        return () => {
            alive = false
        }
    }, [product.id, onHasVariants, onVariantChange, onVariantImageMode])

    /** Preselect the default (active) variant until the customer picks one. */
    useEffect(() => {
        if (!payload || !payload.hasVariants) return
        setSelection((current) => {
            if (Object.values(current).some(Boolean)) return current
            const fallback =
                payload.variants.find(
                    (variant) => variant.isDefault && variant.isActive,
                ) ?? null
            if (!fallback) return current
            const next: Record<string, string> = {}
            for (const link of fallback.optionValues) {
                next[link.optionId] = link.optionValueId
            }
            return next
        })
    }, [payload])

    const selectedVariant = useMemo(() => {
        if (!payload || !payload.hasVariants) return null
        const valueIds = payload.options
            .map((option) => selection[option.id])
            .filter(Boolean)
        if (valueIds.length !== payload.options.length) return null
        return (
            payload.variants.find(
                (variant) =>
                    variant.optionValues.length === valueIds.length &&
                    valueIds.every((id) =>
                        variant.optionValues.some(
                            (link) => link.optionValueId === id,
                        ),
                    ),
            ) ?? null
        )
    }, [payload, selection])

    useEffect(() => {
        onVariantChange(
            selectedVariant && selectedVariant.isActive ? selectedVariant : null,
        )
    }, [selectedVariant, onVariantChange])

    useEffect(() => {
        let alive = true
        if (!selectedVariant) {
            setStock(null)
            return
        }
        productOptionVariantsService
            .variantAvailability(
                selectedVariant.id,
                selectedVariant.companyId ?? product.company?.id ?? null,
            )
            .then((data) => {
                if (alive) setStock(data)
            })
            .catch(() => {
                if (alive) setStock(null)
            })
        return () => {
            alive = false
        }
    }, [selectedVariant, product.company?.id])

    if (!payload || !payload.hasVariants) return null

    /** A value is selectable when it is part of at least one ACTIVE variant with the chosen others. */
    const isValueAvailable = (optionId: string, valueId: string) => {
        const trial = { ...selection, [optionId]: valueId }
        const valueIds = payload.options
            .map((option) => trial[option.id])
            .filter(Boolean)
        if (valueIds.length !== payload.options.length) return true
        return payload.variants.some(
            (variant) =>
                variant.isActive &&
                variant.optionValues.length === valueIds.length &&
                valueIds.every((id) =>
                    variant.optionValues.some(
                        (link) => link.optionValueId === id,
                    ),
                ),
        )
    }

    const pick = (optionId: string, valueId: string) =>
        setSelection((current) => ({ ...current, [optionId]: valueId }))

    const renderOption = (option: ProductOptionDefinition) => {
        const style = option.displayStyle ?? 'BUTTON'
        const selectedValueId = selection[option.id] ?? ''
        const selectedValue = option.values.find(
            (value) => value.id === selectedValueId,
        )

        if (style === 'DROPDOWN') {
            return (
                <select
                    className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    value={selectedValueId}
                    onChange={(event) =>
                        pick(option.id, event.target.value)
                    }
                >
                    <option value="">Choose {option.name}</option>
                    {option.values.map((value) => {
                        const available = isValueAvailable(
                            option.id,
                            value.id,
                        )
                        return (
                            <option
                                key={value.id}
                                value={value.id}
                                disabled={!available}
                            >
                                {value.value}
                                {available ? '' : ' — unavailable'}
                            </option>
                        )
                    })}
                </select>
            )
        }

        if (style === 'SWATCH') {
            return (
                <div className="flex flex-wrap items-center gap-2.5">
                    {option.values.map((value) => {
                        const selected = selectedValueId === value.id
                        const available = isValueAvailable(option.id, value.id)
                        return (
                            <button
                                key={value.id}
                                type="button"
                                title={value.value}
                                aria-label={value.value}
                                aria-pressed={selected}
                                disabled={!available}
                                onClick={() => pick(option.id, value.id)}
                                className={classNames(
                                    'relative h-9 w-9 shrink-0 rounded-full border-2 transition',
                                    selected
                                        ? 'border-emerald-500 ring-2 ring-emerald-200'
                                        : available
                                          ? 'border-white shadow ring-1 ring-gray-200 hover:ring-emerald-300'
                                          : 'cursor-not-allowed border-gray-100 opacity-40',
                                )}
                                style={{
                                    backgroundColor:
                                        value.swatchColor ?? '#e5e7eb',
                                }}
                            >
                                {!available ? (
                                    <span className="absolute inset-0 m-auto h-px w-7 rotate-45 bg-gray-400" />
                                ) : null}
                            </button>
                        )
                    })}
                    {selectedValue ? (
                        <span className="text-xs font-medium text-gray-500">
                            {selectedValue.value}
                        </span>
                    ) : null}
                </div>
            )
        }

        if (style === 'IMAGE') {
            return (
                <div className="flex flex-wrap items-center gap-2.5">
                    {option.values.map((value) => {
                        const selected = selectedValueId === value.id
                        const available = isValueAvailable(option.id, value.id)
                        return (
                            <button
                                key={value.id}
                                type="button"
                                title={value.value}
                                aria-label={value.value}
                                aria-pressed={selected}
                                disabled={!available}
                                onClick={() => pick(option.id, value.id)}
                                className={classNames(
                                    'h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition',
                                    selected
                                        ? 'border-emerald-500 ring-2 ring-emerald-200'
                                        : available
                                          ? 'border-white shadow ring-1 ring-gray-200 hover:ring-emerald-300'
                                          : 'cursor-not-allowed border-gray-100 opacity-40',
                                )}
                            >
                                {value.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={value.imageUrl}
                                        alt={value.value}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center bg-gray-50 px-1 text-[10px] font-medium text-gray-500">
                                        {value.value}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                    {selectedValue ? (
                        <span className="text-xs font-medium text-gray-500">
                            {selectedValue.value}
                        </span>
                    ) : null}
                </div>
            )
        }

        if (style === 'TILE') {
            return (
                <div className="flex flex-wrap gap-2">
                    {option.values.map((value) => {
                        const selected = selectedValueId === value.id
                        const available = isValueAvailable(option.id, value.id)
                        return (
                            <button
                                key={value.id}
                                type="button"
                                aria-pressed={selected}
                                disabled={!available}
                                onClick={() => pick(option.id, value.id)}
                                className={classNames(
                                    'min-w-16 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                                    selected
                                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                        : available
                                          ? 'border-gray-200 bg-white text-gray-800 hover:border-emerald-300 hover:text-emerald-700'
                                          : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through',
                                )}
                            >
                                {value.value}
                            </button>
                        )
                    })}
                </div>
            )
        }

        // BUTTON / pills (default)
        return (
            <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                    const selected = selectedValueId === value.id
                    const available = isValueAvailable(option.id, value.id)
                    return (
                        <button
                            key={value.id}
                            type="button"
                            aria-pressed={selected}
                            disabled={!available}
                            onClick={() =>
                                setSelection((current) => ({
                                    ...current,
                                    [option.id]: selected ? '' : value.id,
                                }))
                            }
                            className={classNames(
                                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                                selected
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                    : available
                                      ? 'border-gray-200 bg-white text-gray-800 hover:border-emerald-300 hover:text-emerald-700'
                                      : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through',
                            )}
                        >
                            {value.value}
                        </button>
                    )
                })}
            </div>
        )
    }

    const variantSoldOut = stock
        ? stock.state === 'OUT_OF_STOCK' || stock.state === 'NOT_MAPPED'
        : false

    return (
        <div className="flex flex-col gap-4">
            {payload.options.map((option) => (
                <div key={option.id}>
                    <p className="text-sm font-medium text-gray-700">
                        {option.name}
                        {option.isRequired ? (
                            <span className="text-rose-500"> *</span>
                        ) : null}
                    </p>
                    <div className="mt-2">{renderOption(option)}</div>
                </div>
            ))}

            {selectedVariant ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-gray-900">
                            {selectedVariant.variantName}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-500">
                            SKU {selectedVariant.sku}
                            {selectedVariant.barcode
                                ? ` · Barcode ${selectedVariant.barcode}`
                                : ''}
                        </span>
                        {variantSoldOut ? (
                            <span className="text-xs font-semibold text-rose-600">
                                Out of stock
                            </span>
                        ) : stock ? (
                            <span className="text-xs font-semibold text-emerald-700">
                                {stock.availableQuantity > 0
                                    ? `${stock.availableQuantity} available`
                                    : 'In stock'}
                            </span>
                        ) : null}
                    </div>
                    {stock ? (
                        <p className="mt-1 text-[11px] text-gray-500">
                            On hand {stock.physicalStock} · Reserved{' '}
                            {stock.reservedQuantity}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export default ProductVariantSelector
