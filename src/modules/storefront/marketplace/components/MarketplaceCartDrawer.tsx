'use client'

import {
    HiOutlineOfficeBuilding,
    HiOutlineShoppingCart,
    HiOutlineTrash,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import classNames from '@/utils/classNames'
import { productSellerLabel } from '@/modules/sd/utils/productSellerLabel'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
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
    pricing: CartPricing | null
    /** Cart products by `productKey`, for images. */
    productsByKey: Map<string, SdProductRecord>
    signedIn: boolean
    onClose: () => void
    onIncrease: (key: string, quantity: number) => void
    onDecrease: (key: string, name: string, quantity: number) => void
    onRemove: (key: string, name: string) => void
    onCheckout: () => void
    onClear: () => void
}

/** Cart grouped by seller; each store ships separately and becomes its own order. */
const MarketplaceCartDrawer = ({
    isOpen,
    isMobile,
    pricing,
    productsByKey,
    signedIn,
    onClose,
    onIncrease,
    onDecrease,
    onRemove,
    onCheckout,
    onClear,
}: MarketplaceCartDrawerProps) => {
    const storeCount = pricing?.divisions.length ?? 0
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
                pricing ? (
                    <div className="flex w-full flex-col gap-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Subtotal</span>
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
                        <Button
                            block
                            className={classNames('mt-2', PRIMARY_BUTTON_CLASS)}
                            customColorClass={PRIMARY_BUTTON}
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
            {pricing ? (
                <div className="flex flex-col gap-5">
                    {storeCount > 1 ? (
                        <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                            Items from {storeCount} stores ship separately, so
                            you will get one order per store.
                        </p>
                    ) : null}
                    {pricing.divisions.map((division) => {
                        const sellerLabel = (() => {
                            for (const line of division.lines) {
                                const product = productsByKey.get(
                                    productKey({
                                        divisionId: division.divisionId,
                                        sku: line.sku,
                                    }),
                                )
                                if (product) return productSellerLabel(product)
                            }
                            return productDivisionLabel(division.divisionId)
                        })()
                        return (
                        <section
                            key={division.divisionId}
                            className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                        >
                            <div className="mb-4 flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                    <HiOutlineOfficeBuilding
                                        className="text-base text-gray-400"
                                        aria-hidden
                                    />
                                    {sellerLabel} Items
                                </h4>
                                <span className="text-xs text-gray-500">
                                    Delivery {formatPrice(division.shipping)}
                                </span>
                            </div>
                            <ul className="flex flex-col gap-4">
                                {division.lines.map((line) => {
                                    const key = productKey({
                                        divisionId: division.divisionId,
                                        sku: line.sku,
                                    })
                                    const product = productsByKey.get(key)
                                    return (
                                        <li key={key} className="flex gap-3">
                                            {product ? (
                                                <ProductImage
                                                    product={product}
                                                    sizes="56px"
                                                    fit="contain"
                                                    className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 p-1"
                                                />
                                            ) : null}
                                            <div className="min-w-0 flex-1">
                                                <div className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                                                    {line.name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {formatPrice(
                                                        line.unitPrice,
                                                    )}{' '}
                                                    each
                                                </div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <QuantityStepper
                                                        quantity={line.quantity}
                                                        label={line.name}
                                                        onDecrease={() =>
                                                            onDecrease(
                                                                key,
                                                                line.name,
                                                                line.quantity,
                                                            )
                                                        }
                                                        onIncrease={() =>
                                                            onIncrease(
                                                                key,
                                                                line.quantity +
                                                                    1,
                                                            )
                                                        }
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        icon={
                                                            <HiOutlineTrash />
                                                        }
                                                        aria-label={`Remove ${line.name}`}
                                                        onClick={() =>
                                                            onRemove(
                                                                key,
                                                                line.name,
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <span className="whitespace-nowrap text-sm font-semibold text-gray-900">
                                                {formatPrice(line.lineTotal)}
                                            </span>
                                        </li>
                                    )
                                })}
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
