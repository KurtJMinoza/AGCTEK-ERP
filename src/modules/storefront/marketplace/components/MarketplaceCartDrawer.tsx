'use client'

import { useMemo } from 'react'
import {
    HiOutlineOfficeBuilding,
    HiOutlineShoppingCart,
    HiOutlineTrash,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Drawer from '@/components/ui/Drawer'
import classNames from '@/utils/classNames'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import type { StorefrontCartItem } from '@/modules/storefront/shared/store/createStorefrontCartStore'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    formatPrice,
    productKey,
} from '../marketplaceUi'

type MarketplaceCartDrawerProps = {
    isOpen: boolean
    isMobile: boolean
    /** All cart lines (the list shows every item; pricing below is selection-only). */
    items: StorefrontCartItem<SdProductRecord>[]
    /** Pricing for the *selected* items only. */
    pricing: CartPricing | null
    signedIn: boolean
    /** Checked cart keys — drives totals, bulk delete and selective checkout. */
    selectedKeys: string[]
    onClose: () => void
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

/** Cart grouped by seller; each store ships separately and becomes its own order. */
const MarketplaceCartDrawer = ({
    isOpen,
    isMobile,
    items,
    pricing,
    signedIn,
    selectedKeys,
    onClose,
    onIncrease,
    onDecrease,
    onRemove,
    onToggleSelect,
    onSelectAll,
    onRemoveSelected,
    onCheckout,
    onClear,
}: MarketplaceCartDrawerProps) => {
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
        const map = new Map<
            string,
            { divisionId: string; rows: Row[] }
        >()
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

    return (
        <Drawer
            title="Your cart"
            isOpen={isOpen}
            placement={isMobile ? 'bottom' : 'right'}
            width={420}
            height="85dvh"
            className={
                isMobile ? '[&_.drawer-content]:rounded-t-2xl' : undefined
            }
            onClose={onClose}
            onRequestClose={onClose}
            footer={
                items.length > 0 ? (
                    <div className="flex w-full flex-col gap-2 text-sm">
                        {pricing && selectedKeys.length > 0 ? (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Subtotal
                                    </span>
                                    <span>{formatPrice(pricing.subtotal)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">
                                        Delivery ({storeCount} store
                                        {storeCount === 1 ? '' : 's'})
                                    </span>
                                    <span>{formatPrice(pricing.shipping)}</span>
                                </div>
                                <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold text-gray-900">
                                    <span>Total</span>
                                    <span>{formatPrice(pricing.grandTotal)}</span>
                                </div>
                            </>
                        ) : (
                            <p className="py-1 text-center text-xs text-gray-400">
                                Select items to see your total.
                            </p>
                        )}
                        <Button
                            block
                            className={classNames('mt-2', PRIMARY_BUTTON_CLASS)}
                            customColorClass={PRIMARY_BUTTON}
                            disabled={selectedKeys.length === 0}
                            onClick={onCheckout}
                        >
                            {signedIn ? 'Checkout' : 'Sign in to checkout'}
                        </Button>
                        <Button
                            block
                            size="sm"
                            variant="plain"
                            onClick={onClear}
                        >
                            Clear cart
                        </Button>
                    </div>
                ) : null
            }
        >
            {items.length > 0 ? (
                <div className="flex flex-col gap-5">
                    {storeCount > 1 ? (
                        <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                            Items from {storeCount} stores ship separately, so
                            you will get one order per store.
                        </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                        <Checkbox
                            checked={allSelected}
                            indeterminate={
                                selectedKeys.length > 0 && !allSelected
                            }
                            onChange={(checked) => onSelectAll(checked)}
                        >
                            <span className="text-sm font-medium text-gray-700">
                                Select all
                            </span>
                        </Checkbox>
                        <Button
                            size="sm"
                            variant="plain"
                            className="!text-red-600 hover:!bg-red-50"
                            disabled={selectedKeys.length === 0}
                            icon={<HiOutlineTrash className="text-base" />}
                            onClick={onRemoveSelected}
                        >
                            Delete selected
                            {selectedKeys.length > 0
                                ? ` (${selectedKeys.length})`
                                : ''}
                        </Button>
                    </div>
                    {groups.map((group) => {
                        const division = pricing?.divisions.find(
                            (d) => d.divisionId === group.divisionId,
                        )
                        return (
                            <section
                                key={group.divisionId}
                                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                            >
                                <div className="mb-4 flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <HiOutlineOfficeBuilding
                                            className="text-base text-gray-400"
                                            aria-hidden
                                        />
                                        {productDivisionLabel(
                                            group.divisionId,
                                        )}{' '}
                                        Items
                                    </h4>
                                    {division ? (
                                        <span className="text-xs text-gray-500">
                                            Delivery{' '}
                                            {formatPrice(division.shipping)}
                                        </span>
                                    ) : null}
                                </div>
                                <ul className="flex flex-col gap-4">
                                    {group.rows.map((row) => (
                                        <li
                                            key={row.key}
                                            className="flex items-start gap-3"
                                        >
                                            <Checkbox
                                                className="mt-1"
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
                                                sizes="56px"
                                                fit="contain"
                                                className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 p-1"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                                                    {row.product.name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {formatPrice(row.unitPrice)}{' '}
                                                    each
                                                </div>
                                                <div className="mt-2 flex items-center gap-2">
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
                                            <span className="whitespace-nowrap text-sm font-semibold text-gray-900">
                                                {formatPrice(
                                                    row.unitPrice *
                                                        row.quantity,
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )
                    })}
                </div>
            ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-500">
                    <HiOutlineShoppingCart className="text-4xl" aria-hidden />
                    <p>Your cart is empty.</p>
                </div>
            )}
        </Drawer>
    )
}

export default MarketplaceCartDrawer