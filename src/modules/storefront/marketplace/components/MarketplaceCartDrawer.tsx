'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
    HiOutlineArrowLeft,
    HiOutlineInformationCircle,
    HiOutlineOfficeBuilding,
    HiOutlineShieldCheck,
    HiOutlineShoppingCart,
    HiOutlineTrash,
    HiOutlineTruck,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import classNames from '@/utils/classNames'
import { productSellerLabel } from '@/modules/sd/utils/productSellerLabel'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import type { StorefrontCartItem } from '@/modules/storefront/shared/store/createStorefrontCartStore'
import {
    CHECKOUT_PATH,
    MARKETPLACE_PATH,
} from '../host'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    formatPrice,
    productKey,
} from '../marketplaceUi'

export type MarketplaceCartProps = {
    /** All cart lines. */
    items: StorefrontCartItem<SdProductRecord>[]
    /** Pricing for the *selected* items only. */
    pricing: CartPricing | null
    signedIn: boolean
    /** Checked cart keys — drives totals, bulk delete and selective checkout. */
    selectedKeys: string[]
    onIncrease: (key: string, quantity: number) => void
    onDecrease: (key: string, name: string, quantity: number) => void
    onRemove: (key: string, name: string) => void
    onToggleSelect: (key: string) => void
    onSelectAll: (select: boolean) => void
    onRemoveSelected: () => void
    onCheckout: () => void
    onClear: () => void
}

type Row = {
    key: string
    product: SdProductRecord
    quantity: number
    unitPrice: number
}

/** Standalone full-page two-column Cart layout without sidebar or modal wrappers. */
const MarketplaceCartDrawer = ({
    items,
    pricing,
    signedIn,
    selectedKeys,
    onIncrease,
    onDecrease,
    onRemove,
    onToggleSelect,
    onSelectAll,
    onRemoveSelected,
    onCheckout,
    onClear,
}: MarketplaceCartProps) => {
    const groups = useMemo(() => {
        const pricedDivisions = new Map<
            string,
            CartPricing['divisions'][number]
        >(
            (pricing?.divisions ?? []).map((division) => [
                division.divisionId,
                division,
            ]),
        )
        const map = new Map<string, { divisionId: string; rows: Row[] }>()
        for (const { product, quantity } of items) {
            const divisionId = product.divisionId
            const group = map.get(divisionId) ?? {
                divisionId,
                rows: [],
            }
            const division = pricedDivisions.get(divisionId)
            const line = division?.lines.find(
                (candidate) => candidate.sku === product.sku,
            )
            group.rows.push({
                key: productKey(product),
                product,
                quantity,
                unitPrice: line?.unitPrice ?? product.price,
            })
            map.set(divisionId, group)
        }
        return [...map.values()]
    }, [items, pricing])

    const lineKeys = groups.flatMap((group) =>
        group.rows.map((row) => row.key),
    )
    const allSelected =
        lineKeys.length > 0 &&
        lineKeys.every((key) => selectedKeys.includes(key))
    const storeCount = groups.length

    if (items.length === 0) {
        return (
            <div className="container mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm sm:p-16">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner">
                        <HiOutlineShoppingCart className="text-4xl" aria-hidden />
                    </div>
                    <div className="max-w-md space-y-1">
                        <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                            Your cart is empty
                        </h2>
                        <p className="text-sm text-gray-500">
                            Looks like you haven&apos;t added any items to your cart yet. Explore our verified sellers and find what you need.
                        </p>
                    </div>
                    <Link
                        href={MARKETPLACE_PATH}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700"
                    >
                        <HiOutlineArrowLeft className="text-base" />
                        Explore Marketplace
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Main left column: Cart Items (approx 2/3 width) */}
                <div className="flex flex-col gap-5 lg:col-span-2">
                    {storeCount > 1 ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs text-emerald-900">
                            <HiOutlineInformationCircle className="shrink-0 text-base text-emerald-700" />
                            <span>
                                Items from <strong>{storeCount} stores</strong> ship separately, so you will receive one delivery and invoice per store.
                            </span>
                        </div>
                    ) : null}

                    {/* Selection Header */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                        <Checkbox
                            checked={allSelected}
                            indeterminate={
                                selectedKeys.length > 0 && !allSelected
                            }
                            onChange={(checked) => onSelectAll(checked)}
                        >
                            <span className="text-sm font-medium text-gray-800">
                                Select all ({selectedKeys.length} of {lineKeys.length} items)
                            </span>
                        </Checkbox>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="plain"
                                className="!text-red-600 hover:!bg-red-50 text-xs"
                                disabled={selectedKeys.length === 0}
                                icon={<HiOutlineTrash className="text-sm" />}
                                onClick={onRemoveSelected}
                            >
                                Delete selected
                                {selectedKeys.length > 0
                                    ? ` (${selectedKeys.length})`
                                    : ''}
                            </Button>
                            <Button
                                size="sm"
                                variant="plain"
                                className="!text-gray-500 hover:!text-gray-800 text-xs"
                                onClick={onClear}
                            >
                                Clear all
                            </Button>
                        </div>
                    </div>

                    {/* Store Groups */}
                    {groups.map((group) => {
                        const first = group.rows[0]?.product
                        const division = pricing?.divisions.find(
                            (d) => d.divisionId === group.divisionId,
                        )
                        return (
                            <section
                                key={group.divisionId}
                                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                            >
                                <div className="mb-4 flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                        <HiOutlineOfficeBuilding
                                            className="text-lg text-emerald-600"
                                            aria-hidden
                                        />
                                        {first
                                            ? productSellerLabel(first)
                                            : productDivisionLabel(
                                                  group.divisionId,
                                              )}{' '}
                                        Items
                                    </h3>
                                    {division ? (
                                        <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                                            Delivery: {formatPrice(division.shipping)}
                                        </span>
                                    ) : null}
                                </div>
                                <ul className="divide-y divide-gray-100">
                                    {group.rows.map((row) => (
                                        <li
                                            key={row.key}
                                            className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={selectedKeys.includes(
                                                        row.key,
                                                    )}
                                                    onChange={() =>
                                                        onToggleSelect(row.key)
                                                    }
                                                    aria-label={`Select ${row.product.name}`}
                                                />
                                                <ProductImage
                                                    product={row.product}
                                                    sizes="72px"
                                                    fit="contain"
                                                    className="h-16 w-16 shrink-0 rounded-xl border border-gray-100 p-1 bg-gray-50/50"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
                                                    {row.product.name}
                                                </div>
                                                <div className="mt-0.5 text-xs text-gray-500">
                                                    SKU: {row.product.sku} · {formatPrice(row.unitPrice)} each
                                                </div>
                                                <div className="mt-3 flex items-center gap-3">
                                                    <QuantityStepper
                                                        quantity={row.quantity}
                                                        label={row.product.name}
                                                        onDecrease={() =>
                                                            onDecrease(
                                                                row.key,
                                                                row.product
                                                                    .name,
                                                                row.quantity,
                                                            )
                                                        }
                                                        onIncrease={() =>
                                                            onIncrease(
                                                                row.key,
                                                                row.quantity + 1,
                                                            )
                                                        }
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        className="!text-gray-400 hover:!text-red-600"
                                                        icon={
                                                            <HiOutlineTrash />
                                                        }
                                                        aria-label={`Remove ${row.product.name}`}
                                                        onClick={() =>
                                                            onRemove(
                                                                row.key,
                                                                row.product
                                                                    .name,
                                                                )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-right sm:self-center">
                                                <div className="text-base font-bold text-gray-900">
                                                    {formatPrice(
                                                        row.unitPrice *
                                                            row.quantity,
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )
                    })}
                </div>

                {/* Sticky right column: Order Summary & Checkout (approx 1/3 width) */}
                <div className="lg:col-span-1">
                    <div className="sticky top-24 flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <h3 className="border-b border-gray-100 pb-3 text-lg font-bold text-gray-900">
                            Order Summary
                        </h3>

                        {pricing && selectedKeys.length > 0 ? (
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between text-gray-600">
                                    <span>Subtotal</span>
                                    <span className="font-medium text-gray-900">
                                        {formatPrice(pricing.subtotal)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>
                                        Delivery ({storeCount} store
                                        {storeCount === 1 ? '' : 's'})
                                    </span>
                                    <span className="font-medium text-gray-900">
                                        {formatPrice(pricing.shipping)}
                                    </span>
                                </div>
                                {pricing.discountAmount > 0 && (
                                    <div className="flex justify-between text-emerald-600">
                                        <span>Discount</span>
                                        <span className="font-semibold">
                                            -{formatPrice(pricing.discountAmount)}
                                        </span>
                                    </div>
                                )}
                                <div className="border-t border-gray-100 pt-3 flex justify-between text-base font-bold text-gray-900">
                                    <span>Total</span>
                                    <span className="text-lg text-emerald-700">
                                        {formatPrice(pricing.grandTotal)}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-500">
                                Select items on the left to review your total.
                            </div>
                        )}

                        <Button
                            block
                            size="lg"
                            className={classNames(
                                'w-full py-3 text-sm font-semibold transition-transform active:scale-[0.98]',
                                PRIMARY_BUTTON_CLASS,
                            )}
                            customColorClass={PRIMARY_BUTTON}
                            disabled={selectedKeys.length === 0}
                            onClick={onCheckout}
                        >
                            {signedIn ? 'Proceed to Checkout' : 'Sign in to Checkout'}
                        </Button>

                        <Link
                            href={MARKETPLACE_PATH}
                            className="text-center text-xs font-medium text-gray-500 transition-colors hover:text-emerald-700"
                        >
                            ← Continue shopping
                        </Link>

                        {/* Trust markers */}
                        <div className="border-t border-gray-100 pt-4 space-y-2 text-[11px] text-gray-400">
                            <div className="flex items-center gap-2">
                                <HiOutlineShieldCheck className="text-sm text-emerald-600" />
                                <span>Direct authorized MM fulfillment & tracking</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <HiOutlineTruck className="text-sm text-emerald-600" />
                                <span>Fast delivery across verified store branches</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MarketplaceCartDrawer