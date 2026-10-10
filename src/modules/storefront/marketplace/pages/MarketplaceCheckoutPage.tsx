'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
    HiOutlinePencilAlt,
    HiOutlineShoppingBag,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import classNames from '@/utils/classNames'
import {
    calculateCartPricing,
    processEcommerceOrder,
    type CartPricing,
    type EcommerceOrderResult,
    type PricingItem,
} from '@/modules/sd/services/ecommerceService'
import { newIdempotencyKey } from '@/modules/sd/services/salesOrderDashboardService'
import type { SalesDivisionId } from '@/modules/sd/services/pricingEngine'
import {
    RetailSessionExpiredError,
    fetchRetailClientAddresses,
    type RetailClientAddress,
} from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import {
    CHECKOUT_PATH,
    MARKETPLACE_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    marketplaceAuthHref,
} from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    SellerTag,
    formatPrice,
    productKey,
} from '../marketplaceUi'
import { useMarketplaceCartStore } from '../store/useMarketplaceCartStore'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'
import MarketplaceHeader from '../components/MarketplaceHeader'

const addressToShipping = (
    address: RetailClientAddress,
    client: NonNullable<ReturnType<typeof useMarketplace>['signedInClient']>,
): SalesOrderShippingDetails => ({
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    addressLine1:
        address.addressLine ??
        address.formattedAddress ??
        client.addressLine1 ??
        '',
    city: address.cityOrMunicipality ?? client.city ?? '',
    region: address.provinceOrState ?? client.region ?? '',
    postalCode: address.postalCode ?? client.postalCode ?? '',
    country: address.country ?? client.country ?? 'PH',
})

const profileShipping = (
    client: NonNullable<ReturnType<typeof useMarketplace>['signedInClient']>,
): SalesOrderShippingDetails => ({
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    addressLine1: client.addressLine1 ?? '',
    city: client.city ?? '',
    region: client.region ?? '',
    postalCode: client.postalCode ?? '',
    country: client.country ?? 'PH',
})

/** Standalone /shop/checkout — review the selected items and place the order. */
const MarketplaceCheckoutPageContent = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { catalog, hydrated, signedInClient, openOrders, openAccount } =
        useMarketplace()
    const items = useMarketplaceCartStore((s) => s.items)
    const selectedKeys = useMarketplaceCartStore((s) => s.selectedKeys)
    const clearCart = useMarketplaceCartStore((s) => s.clearCart)
    const sessionToken = useMarketplaceClientStore((s) => s.token)
    const logout = useMarketplaceClientStore((s) => s.logout)

    const [addresses, setAddresses] = useState<RetailClientAddress[] | null>(
        null,
    )
    const [shipping, setShipping] =
        useState<SalesOrderShippingDetails | null>(null)
    const [shippingIsDefault, setShippingIsDefault] = useState(false)
    const [showAddressPicker, setShowAddressPicker] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [placed, setPlaced] = useState<EcommerceOrderResult | null>(null)
    const checkoutIdRef = useRef<string | null>(null)

    // Buy Now handoff (fully detached from the cart): params carry the item.
    const isBuyNow = searchParams.get('buyNow') === '1'
    const buyNowSku = searchParams.get('sku')
    const buyNowDivision = searchParams.get('division')
    const buyNowQty = Math.max(
        1,
        Math.floor(Number(searchParams.get('qty') ?? '1')) || 1,
    )

    const buyNowProduct = useMemo(
        () =>
            isBuyNow && buyNowSku && buyNowDivision
                ? (catalog.records.find(
                      (p) =>
                          p.sku === buyNowSku &&
                          p.divisionId === buyNowDivision,
                  ) ?? null)
                : null,
        [isBuyNow, buyNowSku, buyNowDivision, catalog.records],
    )
    // Buy Now renders only that one item; otherwise the selected cart items.
    const sourceItems = useMemo(
        () =>
            isBuyNow && buyNowProduct
                ? [{ product: buyNowProduct, quantity: buyNowQty }]
                : items.filter((item) =>
                      selectedKeys.includes(productKey(item.product)),
                  ),
        [isBuyNow, buyNowProduct, buyNowQty, items, selectedKeys],
    )
    const selectedProducts = useMemo(
        () =>
            new Map(
                sourceItems.map((item) => [
                    productKey(item.product),
                    item.product,
                ]),
            ),
        [sourceItems],
    )
    const pricingItems = useMemo<PricingItem[]>(
        () =>
            sourceItems.map((item) => ({
                divisionId: item.product.divisionId as SalesDivisionId,
                sku: item.product.sku,
                quantity: item.quantity,
            })),
        [sourceItems],
    )
    const pricing = useMemo<CartPricing | null>(() => {
        if (pricingItems.length === 0) return null
        try {
            return calculateCartPricing(pricingItems)
        } catch {
            return null
        }
    }, [pricingItems])

    // Default shipping: the customer's isDefault address, fall back to profile.
    useEffect(() => {
        if (!hydrated || !signedInClient || !sessionToken) return
        let cancelled = false
        const fallback = profileShipping(signedInClient)
        setShipping((prev) => prev ?? fallback)
        setAddresses(null)
        void fetchRetailClientAddresses(sessionToken)
            .then((list) => {
                if (cancelled) return
                setAddresses(list)
                const primary = list.find((a) => a.isDefault) ?? list[0]
                if (primary) {
                    setShipping(
                        addressToShipping(primary, signedInClient),
                    )
                    setShippingIsDefault(primary.isDefault)
                } else {
                    setShippingIsDefault(false)
                }
            })
            .catch(() => {
                if (!cancelled) setAddresses([])
            })
        return () => {
            cancelled = true
        }
    }, [hydrated, signedInClient, sessionToken])

    const placeOrder = async () => {
        if (!signedInClient || !sessionToken || !shipping || !pricing) return
        setSubmitting(true)
        setSubmitError(null)
        try {
            checkoutIdRef.current ??= newIdempotencyKey('web')
            const result = await processEcommerceOrder(
                {
                    checkoutId: checkoutIdRef.current,
                    customerId: signedInClient.customerId,
                    items: pricingItems,
                    shipping,
                },
                sessionToken,
            )
            checkoutIdRef.current = null
            // A Buy Now item never touched the cart, so leave it intact.
            if (!isBuyNow) clearCart()
            setPlaced(result)
        } catch (error) {
            if (error instanceof RetailSessionExpiredError) {
                logout()
                router.push(marketplaceAuthHref(MARKETPLACE_SIGN_IN_PATH, CHECKOUT_PATH))
                return
            }
            setSubmitError(
                error instanceof Error ? error.message : 'Please try again.',
            )
        } finally {
            setSubmitting(false)
        }
    }

    const summaryRows =
        pricing?.divisions.flatMap((division) =>
            division.lines.map((line) => ({
                key: productKey({
                    divisionId: division.divisionId,
                    sku: line.sku,
                }),
                divisionId: division.divisionId,
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
            })),
        ) ?? []
    const storeCount = pricing?.divisions.length ?? 0

    return (
        <div className="min-h-screen">
            <MarketplaceHeader />
            <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
                {!hydrated ? null : placed ? (
                    <section className="mx-auto mt-6 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <HiOutlineCheckCircle
                            className="mx-auto text-5xl text-emerald-500"
                            aria-hidden
                        />
                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
                            Order placed
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Order{' '}
                            <span className="font-mono font-medium text-gray-900">
                                {placed.salesOrderId}
                            </span>{' '}
                            is pending delivery.
                        </p>
                        <p className="mt-2 text-sm">
                            Total due on delivery:{' '}
                            <span className="font-semibold text-gray-900">
                                {formatPrice(placed.grandTotal)}
                            </span>
                        </p>
                        <div className="mt-5 flex flex-col gap-2">
                            <Button
                                block
                                className={PRIMARY_BUTTON_CLASS}
                                customColorClass={PRIMARY_BUTTON}
                                onClick={() => {
                                    openOrders()
                                    router.replace(MARKETPLACE_PATH)
                                }}
                            >
                                View my orders
                            </Button>
                            <Button
                                block
                                variant="plain"
                                onClick={() => router.replace(MARKETPLACE_PATH)}
                            >
                                Continue shopping
                            </Button>
                        </div>
                    </section>
                ) : !signedInClient ? (
                    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <HiOutlineShoppingBag
                            className="mx-auto text-4xl text-gray-300"
                            aria-hidden
                        />
                        <h1 className="mt-3 text-xl font-bold text-gray-900">
                            Sign in to check out
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Your selection is saved. Sign in to review and
                            place your order.
                        </p>
                        <Button
                            block
                            className="mt-5"
                            customColorClass={PRIMARY_BUTTON}
                            onClick={openAccount}
                        >
                            Sign in
                        </Button>
                    </section>
                ) : !catalog.ready ? (
                    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <h1 className="text-xl font-bold text-gray-900">
                            Loading the catalogue…
                        </h1>
                    </section>
                ) : isBuyNow && !buyNowProduct ? (
                    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <h1 className="text-xl font-bold text-gray-900">
                            This item is no longer available
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            It may have been removed from the shop.
                        </p>
                        <Button
                            block
                            className="mt-5"
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => router.push(MARKETPLACE_PATH)}
                        >
                            Back to shopping
                        </Button>
                    </section>
                ) : sourceItems.length === 0 ? (
                    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <h1 className="text-xl font-bold text-gray-900">
                            Nothing selected to check out
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Select items in your cart before checking out.
                        </p>
                        <Button
                            block
                            className="mt-5"
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => router.push(MARKETPLACE_PATH)}
                        >
                            Back to shopping
                        </Button>
                    </section>
                ) : !pricing ? (
                    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <h1 className="text-xl font-bold text-gray-900">
                            Unable to price your selection
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Check your items and try again.
                        </p>
                        <Button
                            block
                            className="mt-5"
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => router.push(MARKETPLACE_PATH)}
                        >
                            Back to shopping
                        </Button>
                    </section>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                        <div className="flex flex-col gap-6">
                            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <HiOutlineLocationMarker
                                            className="text-base text-gray-400"
                                            aria-hidden
                                        />
                                        Delivery address
                                    </h2>
                                    {addresses && addresses.length > 0 ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="plain"
                                            icon={
                                                <HiOutlinePencilAlt className="text-base" />
                                            }
                                            onClick={() =>
                                                setShowAddressPicker(
                                                    (v) => !v,
                                                )
                                            }
                                        >
                                            {showAddressPicker
                                                ? 'Done'
                                                : 'Change'}
                                        </Button>
                                    ) : null}
                                </div>
                                {shipping ? (
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {shipping.fullName} · {shipping.phone}
                                        </p>
                                        <p className="mt-0.5 text-sm leading-5 text-gray-600">
                                            {shipping.addressLine1},{' '}
                                            {shipping.city},{' '}
                                            {shipping.region}{' '}
                                            {shipping.postalCode}
                                        </p>
                                        {shippingIsDefault && shipping ? (
                                            <p className="mt-1 text-xs font-medium text-emerald-700">
                                                Default address
                                            </p>
                                        ) : null}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400">
                                        Loading shipping details…
                                    </p>
                                )}
                                {showAddressPicker ? (
                                    addresses === null ? (
                                        <p className="mt-3 text-sm text-gray-400">
                                            Loading saved addresses…
                                        </p>
                                    ) : addresses.length === 0 ? (
                                        <p className="mt-3 text-sm text-gray-400">
                                            No saved addresses yet.
                                        </p>
                                    ) : (
                                        <ul className="mt-3 flex flex-col gap-2">
                                            {addresses.map((address) => (
                                                <li key={address.id}>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-start justify-between gap-2 rounded-xl border border-gray-100 bg-white p-3 text-left hover:border-emerald-200"
                                                        onClick={() => {
                                                            setShipping(
                                                                addressToShipping(
                                                                    address,
                                                                    signedInClient,
                                                                ),
                                                            )
                                                            setShippingIsDefault(
                                                                address.isDefault,
                                                            )
                                                            setShowAddressPicker(
                                                                false,
                                                            )
                                                        }}
                                                    >
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium text-gray-900">
                                                                {address.addressType ===
                                                                'WORK'
                                                                    ? 'Work'
                                                                    : 'Home'}
                                                            </span>
                                                            <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                                                                {address.addressLine ??
                                                                    address.formattedAddress}
                                                                {address.cityOrMunicipality
                                                                    ? `, ${address.cityOrMunicipality}`
                                                                    : ''}
                                                            </span>
                                                        </span>
                                                        {address.isDefault ? (
                                                            <span className="shrink-0 text-xs font-semibold text-emerald-700">
                                                                Default
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                ) : null}
                                <button
                                    type="button"
                                    className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                                    onClick={openAccount}
                                >
                                    Manage addresses
                                </button>
                            </section>

                            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <h2 className="mb-4 text-sm font-semibold text-gray-900">
                                    Items to order
                                </h2>
                                {storeCount > 1 ? (
                                    <p className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                        Items from {storeCount} stores ship
                                        separately, so you will get one order
                                        per store.
                                    </p>
                                ) : null}
                                <ul className="flex flex-col gap-4">
                                    {summaryRows.map((row) => {
                                        const product =
                                            selectedProducts.get(row.key)
                                        return (
                                            <li
                                                key={row.key}
                                                className="flex items-start gap-3"
                                            >
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
                                                        {row.name}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        <SellerTag
                                                            divisionId={
                                                                row.divisionId
                                                            }
                                                            short
                                                        />
                                                    </div>
                                                    <div className="mt-0.5 text-xs text-gray-500">
                                                        {row.quantity} ×{' '}
                                                        {formatPrice(
                                                            row.unitPrice,
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="whitespace-nowrap text-sm font-semibold text-gray-900">
                                                    {formatPrice(row.lineTotal)}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </section>
                        </div>

                        <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-24">
                            <h2 className="mb-4 text-sm font-semibold text-gray-900">
                                Order summary
                            </h2>
                            <div className="flex flex-col gap-2 text-sm">
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
                            </div>

                            {submitError ? (
                                <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                                    {submitError}
                                </p>
                            ) : null}

                            <Button
                                block
                                className={classNames(
                                    'mt-4',
                                    PRIMARY_BUTTON_CLASS,
                                )}
                                customColorClass={PRIMARY_BUTTON}
                                disabled={!shipping || submitting}
                                loading={submitting}
                                onClick={() => void placeOrder()}
                            >
                                Place Order
                            </Button>
                            <p className="mt-2 text-center text-xs text-gray-400">
                                Cash on delivery — pay each store when your
                                order arrives.
                            </p>
                        </aside>
                    </div>
                )}
            </main>
        </div>
    )
}

/**
 * Suspense boundary: required so useSearchParams() can prerender the route.
 */
const MarketplaceCheckoutPage = () => (
    <Suspense fallback={null}>
        <MarketplaceCheckoutPageContent />
    </Suspense>
)

export default MarketplaceCheckoutPage