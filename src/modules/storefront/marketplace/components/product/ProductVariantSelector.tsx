'use client'

import { useEffect, useMemo, useState } from 'react'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    effectiveVariantPrice,
    productOptionVariantsService,
    type ProductOptionDefinition,
    type ProductOptionsVariants,
    type ProductVariantDefinition,
    type VariantImageMode,
    variantLabel,
} from '@/modules/sd/services/productOptionVariantsService'
import { formatPrice } from '../../marketplaceUi'

/**
 * Ecommerce product option selector (Size, Color, Bottle Size, Flavor, Pack…).
 * Renders each option with its admin-chosen display style — buttons, dropdown,
 * color swatches, image swatches or tiles. Resolves the exact variant for the
 * current selections, preselects the default variant, disables combinations
 * without an ACTIVE variant and reports per-variant MM availability.
 *
 * A product WITHOUT option groups (its variants are told apart by the
 * material they sell) gets a variant list instead, so those variants are
 * visible and pickable on the product page too.
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
    /** The variant the customer picked (products without option groups). */
    const [chosenVariantId, setChosenVariantId] = useState<string | null>(null)
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

    /** The variants a customer may pick: active, published and not hidden. */
    const sellableVariants = useMemo(
        () =>
            (payload?.variants ?? []).filter(
                (variant) =>
                    variant.isActive && variant.isPublished && !variant.isHidden,
            ),
        [payload],
    )

    const hasOptionGroups = (payload?.options.length ?? 0) > 0

    /** Preselect the default (active) variant until the customer picks one. */
    useEffect(() => {
        if (!payload || !payload.hasVariants) return
        if (payload.options.length > 0) {
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
            return
        }
        // No option groups: preselect the default customer-visible variant.
        if (sellableVariants.length === 0) return
        setChosenVariantId((current) => {
            if (current && sellableVariants.some((v) => v.id === current)) {
                return current
            }
            const fallback =
                sellableVariants.find((variant) => variant.isDefault) ??
                sellableVariants[0]
            return fallback.id
        })
    }, [payload, sellableVariants])

    const selectedVariant = useMemo(() => {
        if (!payload || !payload.hasVariants) return null

        // A product WITH option groups: the chosen option values decide.
        if (payload.options.length > 0) {
            const valueIds = payload.options
                .map((option) => selection[option.id])
                .filter(Boolean)
            if (valueIds.length !== payload.options.length) return null
            const matches = (variant: ProductVariantDefinition) =>
                variant.optionValues.length === valueIds.length &&
                valueIds.every((id) =>
                    variant.optionValues.some(
                        (link) => link.optionValueId === id,
                    ),
                )
            return (
                payload.variants.find(
                    (variant) =>
                        matches(variant) &&
                        variant.isActive &&
                        variant.isPublished &&
                        !variant.isHidden,
                ) ??
                payload.variants.find(matches) ??
                null
            )
        }

        // A product WITHOUT option groups: the customer picks the variant.
        if (sellableVariants.length > 0) {
            return sellableVariants.find((v) => v.id === chosenVariantId) ?? null
        }

        // Only the hidden default variant (a SIMPLE product): it stays the
        // sellable item, but it is never shown to the customer.
        return (
            payload.variants.find(
                (variant) => variant.isDefault && variant.isActive,
            ) ?? null
        )
    }, [payload, selection, chosenVariantId, sellableVariants])

    useEffect(() => {
        onVariantChange(
            selectedVariant && selectedVariant.isActive ? selectedVariant : null,
        )
    }, [selectedVariant, onVariantChange])

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
                    className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 focus:border-shop-400 focus:outline-none focus:ring-2 focus:ring-shop-100"
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
                                        ? 'border-shop-500 ring-2 ring-shop-200'
                                        : available
                                          ? 'border-white shadow ring-1 ring-gray-200 hover:ring-shop-300'
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
                                        ? 'border-shop-500 ring-2 ring-shop-200'
                                        : available
                                          ? 'border-white shadow ring-1 ring-gray-200 hover:ring-shop-300'
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
                                    'min-w-16 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500',
                                    selected
                                        ? 'border-shop-500 bg-shop-500 text-white shadow-sm'
                                        : available
                                          ? 'border-gray-200 bg-white text-gray-800 hover:border-shop-300 hover:text-shop-700'
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
                                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500',
                                selected
                                    ? 'border-shop-500 bg-shop-500 text-white shadow-sm'
                                    : available
                                      ? 'border-gray-200 bg-white text-gray-800 hover:border-shop-300 hover:text-shop-700'
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

    /**
     * A product whose variants have no customer-selectable options: the
     * variants are told apart by the material they sell, so they are listed
     * and picked directly. Each entry shows the product it belongs to.
     */
    if (!hasOptionGroups) {
        if (sellableVariants.length === 0) return null
        return (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-700">
                    Choose a variant
                </p>
                <ul className="grid grid-cols-1 gap-2.5">
                    {sellableVariants.map((variant) => {
                        const selected = variant.id === selectedVariant?.id
                        return (
                            <li key={variant.id}>
                                <button
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() =>
                                        setChosenVariantId(variant.id)
                                    }
                                    className={classNames(
                                        'flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500',
                                        selected
                                            ? 'border-shop-500 bg-shop-50/60 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-shop-300',
                                    )}
                                >
                                    {variant.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={variant.imageUrl}
                                            alt=""
                                            className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover"
                                        />
                                    ) : (
                                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-medium text-gray-400">
                                            {variant.variantName
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-gray-900">
                                            {variantLabel(variant)}
                                        </span>
                                        {variantLabel(variant) !==
                                        variant.variantName ? (
                                            <span className="block truncate text-[11px] text-gray-500">
                                                {variant.variantName}
                                            </span>
                                        ) : null}
                                        <span className="block truncate font-mono text-[11px] text-gray-500">
                                            SKU {variant.sku}
                                            {variant.barcode
                                                ? ` · ${variant.barcode}`
                                                : ''}
                                        </span>
                                        <span className="block truncate text-[11px] text-gray-400">
                                            Product: {product.name} ·{' '}
                                            {product.sku}
                                        </span>
                                        <span className="mt-1 block text-sm font-semibold text-gray-900">
                                            {formatPrice(
                                                effectiveVariantPrice(
                                                    product.price,
                                                    variant,
                                                ),
                                            )}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </div>
        )
    }

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
        </div>
    )
}

export default ProductVariantSelector
