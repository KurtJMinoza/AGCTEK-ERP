'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { HiOutlineCheckCircle } from 'react-icons/hi'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useResponsive from '@/utils/hooks/useResponsive'
import { LPG_DIVISION_ID, isLpgAddon } from '@/modules/sd/catalogs/lpgCatalog'
import { useMarketplaceProducts } from '@/modules/sd/hooks/useMarketplaceProducts'
import {
    calculateCartPricing,
    processEcommerceOrder,
    type CartPricing,
    type EcommerceOrderResult,
} from '@/modules/sd/services/ecommerceService'
import type { SalesDivisionId } from '@/modules/sd/services/pricingEngine'
import {
    fetchStorefrontAvailability,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import {
    newIdempotencyKey,
    type CheckoutPaymentSelection,
} from '@/modules/sd/services/salesOrderDashboardService'
import {
    RetailSessionExpiredError,
    type RetailClientProfile,
} from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import MarketplaceCartDrawer from './components/MarketplaceCartDrawer'
import MarketplaceAuthDialog, {
    type MarketplaceAuthMode,
} from './components/MarketplaceAuthDialog'
import MarketplaceCheckoutDialog from './components/MarketplaceCheckoutDialog'
import MarketplaceProductCard from './components/MarketplaceProductCard'
import {
    CHECKOUT_PATH,
    MARKETPLACE_ACCOUNT_PATH,
    MARKETPLACE_ORDERS_PATH,
    productHref,
    safeReturnPath,
} from './host'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    SellerTag,
    formatPrice,
    productKey,
} from './marketplaceUi'
import { useMarketplaceCartStore } from './store/useMarketplaceCartStore'
import { useMarketplaceClientStore } from './store/useMarketplaceClientStore'
import { useMarketplaceFavoritesStore } from './store/useMarketplaceFavoritesStore'

const DANGER_BUTTON = () => 'bg-red-500 hover:bg-red-600 text-white'

const NO_ITEMS: never[] = []

type PendingAdd = {
    product: SdProductRecord
    quantity: number
    /** "Buy now": open the cart after adding. */
    buyNow: boolean
}

type MarketplaceContextValue = {
    catalog: ReturnType<typeof useMarketplaceProducts>
    /** Persisted stores (cart, session, favourites) have loaded on the client. */
    hydrated: boolean
    signedInClient: RetailClientProfile | null
    sessionToken: string | null
    itemCount: number
    quantityByKey: Map<string, number>
    favorites: Set<string>
    toggleFavorite: (key: string) => void
    /** Every add-to-cart is confirmed first; guests may add, sign-in is required at checkout. */
    requestAdd: (
        product: SdProductRecord,
        quantity?: number,
        buyNow?: boolean,
    ) => void | Promise<void>
    openCart: () => void
    openOrders: () => void
    openAccount: () => void
    openProduct: (product: SdProductRecord) => void
    /** Product card wired to cart, favourites and the product page. */
    renderCard: (
        product: SdProductRecord,
        onOpen?: (product: SdProductRecord) => void,
    ) => ReactNode
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null)

export const useMarketplace = () => {
    const value = useContext(MarketplaceContext)
    if (!value) {
        throw new Error(
            'useMarketplace must be used inside MarketplaceProvider',
        )
    }
    return value
}

export const notify = (
    type: 'success' | 'danger',
    title: string,
    message: string,
) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

/**
 * Marketplace session shared by every /shop page: catalogue, cart drawer,
 * sign-in, add-to-cart confirmation, checkout and My Orders.
 */
const MarketplaceProvider = ({ children }: { children: ReactNode }) => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const catalog = useMarketplaceProducts()

    const storedItems = useMarketplaceCartStore((s) => s.items)
    const isCartOpen = useMarketplaceCartStore((s) => s.isDrawerOpen)
    const openCart = useMarketplaceCartStore((s) => s.openDrawer)
    const closeCart = useMarketplaceCartStore((s) => s.closeDrawer)
    const addItem = useMarketplaceCartStore((s) => s.addItem)
    const updateQuantity = useMarketplaceCartStore((s) => s.updateQuantity)
    const removeItem = useMarketplaceCartStore((s) => s.removeItem)
    const clearCart = useMarketplaceCartStore((s) => s.clearCart)
    const syncCatalog = useMarketplaceCartStore((s) => s.syncCatalog)
    const selectedKeys = useMarketplaceCartStore((s) => s.selectedKeys)
    const toggleSelect = useMarketplaceCartStore((s) => s.toggleSelect)
    const setSelectAll = useMarketplaceCartStore((s) => s.setSelectAll)
    const removeItems = useMarketplaceCartStore((s) => s.removeItems)

    const client = useMarketplaceClientStore((s) => s.client)
    const token = useMarketplaceClientStore((s) => s.token)
    const logout = useMarketplaceClientStore((s) => s.logout)
    const pathname = usePathname()

    const favoriteKeys = useMarketplaceFavoritesStore((s) => s.keys)
    const toggleFavorite = useMarketplaceFavoritesStore((s) => s.toggle)

    const [hydrated, setHydrated] = useState(false)
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [promoCode, setPromoCode] = useState<string | null>(null)
    const [pendingCheckout, setPendingCheckout] = useState<{
        shipping: SalesOrderShippingDetails
        payment: CheckoutPaymentSelection
    } | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [checkoutError, setCheckoutError] = useState<string | null>(null)
    const [placedOrder, setPlacedOrder] = useState<EcommerceOrderResult | null>(
        null,
    )
    const [pendingRemoval, setPendingRemoval] = useState<{
        key: string
        name: string
    } | null>(null)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)
    const [authMode, setAuthMode] = useState<MarketplaceAuthMode | null>(null)
    const [authReturnPath, setAuthReturnPath] = useState<string | null>(null)
    const [afterSignIn, setAfterSignIn] = useState<
        'checkout' | 'orders' | null
    >(null)
    /** Add-to-cart awaiting confirmation. */
    const [requestedAdd, setRequestedAdd] = useState<PendingAdd | null>(null)
    const checkoutIdRef = useRef<string | null>(null)

    useEffect(() => setHydrated(true), [])
    const signedInClient = hydrated ? client : null
    const sessionToken = hydrated ? token : null
    const items = hydrated ? storedItems : NO_ITEMS

    useEffect(() => {
        if (catalog.ready) syncCatalog(catalog.records)
    }, [catalog.ready, catalog.records, syncCatalog])

    /** Open the one marketplace auth modal; it resumes the protected action after sign-in. */
    const openAuth = useCallback(
        (
            intent: 'checkout' | 'orders' | null,
            mode: MarketplaceAuthMode = 'sign-in',
        ) => {
            setAfterSignIn(intent)
            setAuthReturnPath(null)
            closeCart()
            setAuthMode(mode)
        },
        [closeCart],
    )

    const closeAuth = useCallback(() => {
        setAuthMode(null)
        setAfterSignIn(null)
        setAuthReturnPath(null)
    }, [])

    /** Legacy auth links land on the storefront and open the same modal. */
    useEffect(() => {
        const requestedMode = searchParams.get('auth')
        if (requestedMode !== 'sign-in' && requestedMode !== 'sign-up') return

        setAuthMode(requestedMode)
        setAuthReturnPath(safeReturnPath(searchParams.get('next')))

        const params = new URLSearchParams(searchParams.toString())
        params.delete('auth')
        params.delete('next')
        const query = params.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
        })
    }, [pathname, router, searchParams])

    useEffect(() => {
        if (!afterSignIn || !signedInClient) return
        // Checkout is a full page now; the modal shown after sign-in was removed.
        if (afterSignIn === 'checkout') router.push(CHECKOUT_PATH)
        else router.push(MARKETPLACE_ORDERS_PATH)
        setAfterSignIn(null)
        setAuthReturnPath(null)
    }, [afterSignIn, signedInClient, router])

    const handleAuthenticated = useCallback(
        (mode: MarketplaceAuthMode) => {
            setAuthMode(null)
            notify(
                'success',
                mode === 'sign-in' ? 'Welcome back' : 'Account created',
                mode === 'sign-in'
                    ? 'You are now signed in.'
                    : 'Add your phone number and delivery addresses in My Account.',
            )
            if (afterSignIn) return

            const returnPath = authReturnPath
            setAuthReturnPath(null)
            if (returnPath && returnPath !== pathname) {
                router.replace(returnPath)
            } else if (mode === 'sign-up') {
                router.push(MARKETPLACE_ACCOUNT_PATH)
            }
        },
        [afterSignIn, authReturnPath, pathname, router],
    )

    const quantityByKey = useMemo(
        () =>
            new Map(
                items.map((item) => [productKey(item.product), item.quantity]),
            ),
        [items],
    )
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

    // Selective checkout: only checked items are priced and ordered.
    const pricingItems = useMemo(
        () =>
            items
                .filter((item) =>
                    selectedKeys.includes(productKey(item.product)),
                )
                .map((item) => ({
                    divisionId: item.product.divisionId as SalesDivisionId,
                    sku: item.product.sku,
                    quantity: item.quantity,
                })),
        [items, selectedKeys],
    )

    const pricing = useMemo<CartPricing | null>(() => {
        if (items.length === 0 || !catalog.ready) return null
        try {
            return calculateCartPricing(pricingItems, promoCode)
        } catch {
            try {
                return calculateCartPricing(pricingItems, null)
            } catch {
                return null
            }
        }
        // catalog.records: SD pricing reads the catalog store.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pricingItems, promoCode, catalog.ready, catalog.records])

    useEffect(() => {
        if (promoCode && pricing && !pricing.promoCode) setPromoCode(null)
    }, [promoCode, pricing])

    const applyPromo = (code: string | null) => {
        if (!code) {
            setPromoCode(null)
            return null
        }
        try {
            const next = calculateCartPricing(pricingItems, code)
            setPromoCode(next.promoCode)
            return null
        } catch (error) {
            return error instanceof Error ? error.message : 'Invalid code'
        }
    }

    const { smaller } = useResponsive()
    const isMobile = smaller.sm

    const decreaseItem = useCallback(
        (key: string, name: string, quantity: number) => {
            if (quantity <= 1) setPendingRemoval({ key, name })
            else updateQuantity(key, quantity - 1)
        },
        [updateQuantity],
    )

    const startCheckout = () => {
        const selected = items.filter((item) =>
            selectedKeys.includes(productKey(item.product)),
        )
        if (selected.length === 0) return
        const lpgItems = selected.filter(
            (item) => item.product.divisionId === LPG_DIVISION_ID,
        )
        if (
            lpgItems.length > 0 &&
            lpgItems.every((item) => isLpgAddon(item.product))
        ) {
            notify(
                'danger',
                'Add an LPG refill or set',
                'LPG add-ons cannot be ordered alone. Add at least one LPG refill or set.',
            )
            return
        }
        checkoutIdRef.current ??= newIdempotencyKey('web')
        if (signedInClient) {
            router.push(CHECKOUT_PATH)
            return
        }
        openAuth('checkout')
    }

    const openOrders = useCallback(() => {
        if (signedInClient) {
            router.push(MARKETPLACE_ORDERS_PATH)
            return
        }
        openAuth('orders')
    }, [signedInClient, openAuth, router])

    const openAccount = useCallback(() => {
        if (signedInClient) router.push(MARKETPLACE_ACCOUNT_PATH)
        else openAuth(null)
    }, [signedInClient, router, openAuth])

    const placeOrder = async (
        shipping: SalesOrderShippingDetails,
        payment: CheckoutPaymentSelection,
    ) => {
        setPendingCheckout(null)
        setCheckoutError(null)
        if (!signedInClient || !sessionToken) {
            setCheckoutOpen(false)
            openAuth('checkout')
            return
        }
        setSubmitting(true)
        try {
            const result = await processEcommerceOrder(
                {
                    checkoutId: checkoutIdRef.current ?? undefined,
                    customerId: signedInClient.customerId,
                    items: pricingItems,
                    shipping,
                    discountCode: promoCode ?? undefined,
                    paymentMethod: payment.method,
                    paymentProvider: payment.provider,
                    cardDemoSimulateFailure: payment.cardDemoSimulateFailure,
                },
                sessionToken,
            )
            checkoutIdRef.current = null
            clearCart()
            setPromoCode(null)
            setCheckoutOpen(false)
            closeCart()
            setPlacedOrder(result)
        } catch (error) {
            if (error instanceof RetailSessionExpiredError) {
                logout()
                setCheckoutOpen(false)
                setCheckoutError(null)
                notify('danger', 'Please sign in again', error.message)
                openAuth('checkout')
                return
            }
            const message =
                error instanceof Error ? error.message : 'Please try again.'
            setCheckoutError(message)
            notify('danger', 'Order not placed', message)
        } finally {
            setSubmitting(false)
        }
    }

    const requestAdd = useCallback(
        async (product: SdProductRecord, quantity = 1, buyNow = false) => {
            // Product cards do not load ATP individually (to avoid an N+1
            // catalog request), so check just-in-time when a shopper adds an
            // item. Checkout repeats the check on the server before an SO can
            // be created.
            try {
                const stock = await fetchStorefrontAvailability(
                    product.divisionId,
                    product.sku,
                )
                const available = Math.max(
                    0,
                    Math.floor(stock.availableQuantity),
                )
                if (stock.state !== 'NON_INVENTORY' && available < quantity) {
                    notify(
                        'danger',
                        'Out of stock',
                        `${product.name} is no longer available in the requested quantity.`,
                    )
                    return
                }
            } catch {
                // The server checkout gate remains authoritative. Let shoppers
                // keep browsing if this optional convenience check is offline.
            }
            setRequestedAdd({ product, quantity, buyNow })
        },
        [],
    )

    const cancelAdd = () => setRequestedAdd(null)

    const confirmAdd = () => {
        if (!requestedAdd) return
        const { product, quantity, buyNow } = requestedAdd
        if (buyNow) {
            // Buy Now is fully detached from the cart: hand the item straight
            // to the checkout page via query params (it resolves the product
            // from the catalogue). Nothing is added to the cart.
            const params = new URLSearchParams({
                buyNow: '1',
                division: product.divisionId,
                sku: product.sku,
                qty: String(quantity),
            })
            cancelAdd()
            router.push(`${CHECKOUT_PATH}?${params.toString()}`)
            return
        }
        addItem(product, quantity)
        cancelAdd()
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const increaseItem = useCallback(
        (product: SdProductRecord, quantity: number) =>
            updateQuantity(productKey(product), quantity + 1),
        [updateQuantity],
    )

    const openProduct = useCallback(
        (product: SdProductRecord) => router.push(productHref(product)),
        [router],
    )

    const favorites = useMemo(
        () => new Set(hydrated ? favoriteKeys : []),
        [hydrated, favoriteKeys],
    )

    const renderCard = useCallback(
        (
            product: SdProductRecord,
            onOpen: (product: SdProductRecord) => void = openProduct,
        ) => {
            const key = productKey(product)
            const quantity = quantityByKey.get(key) ?? 0
            return (
                <MarketplaceProductCard
                    product={product}
                    quantity={quantity}
                    favorite={favorites.has(key)}
                    onOpen={() => onOpen(product)}
                    onAdd={() => requestAdd(product)}
                    onIncrease={() => increaseItem(product, quantity)}
                    onDecrease={() => decreaseItem(key, product.name, quantity)}
                    onToggleFavorite={() => toggleFavorite(key)}
                />
            )
        },
        [
            openProduct,
            quantityByKey,
            favorites,
            requestAdd,
            increaseItem,
            decreaseItem,
            toggleFavorite,
        ],
    )

    const value: MarketplaceContextValue = {
        catalog,
        hydrated,
        signedInClient,
        sessionToken,
        itemCount,
        quantityByKey,
        favorites,
        toggleFavorite,
        requestAdd,
        openCart,
        openOrders,
        openAccount,
        openProduct,
        renderCard,
    }

    return (
        <MarketplaceContext.Provider value={value}>
            {children}

            <MarketplaceAuthDialog
                isOpen={authMode !== null}
                initialMode={authMode ?? 'sign-in'}
                onClose={closeAuth}
                onAuthenticated={handleAuthenticated}
            />

            <ConfirmDialog
                isOpen={requestedAdd !== null}
                type="info"
                title={requestedAdd?.buyNow ? 'Buy this now?' : 'Add to cart?'}
                confirmText={
                    requestedAdd?.buyNow ? 'Buy Now' : 'Add to cart'
                }
                cancelText="Cancel"
                confirmButtonProps={{ customColorClass: PRIMARY_BUTTON }}
                onClose={cancelAdd}
                onRequestClose={cancelAdd}
                onCancel={cancelAdd}
                onConfirm={confirmAdd}
            >
                {requestedAdd ? (
                    <div className="flex flex-col gap-2 text-sm">
                        <SellerTag product={requestedAdd.product} />
                        <p className="font-semibold text-gray-900">
                            {requestedAdd.product.name}
                        </p>
                        <p>
                            {requestedAdd.quantity} ×{' '}
                            {formatPrice(requestedAdd.product.price)} ={' '}
                            <span className="font-semibold text-gray-900">
                                {formatPrice(
                                    requestedAdd.product.price *
                                        requestedAdd.quantity,
                                )}
                            </span>
                        </p>
                        <p className="text-xs text-gray-500">
                            Final price, promos and delivery are confirmed at
                            checkout.
                        </p>
                    </div>
                ) : null}
            </ConfirmDialog>

            <MarketplaceCartDrawer
                isOpen={isCartOpen}
                isMobile={isMobile}
                items={items}
                pricing={pricing}
                signedIn={Boolean(signedInClient)}
                selectedKeys={selectedKeys}
                onClose={closeCart}
                onIncrease={updateQuantity}
                onDecrease={decreaseItem}
                onRemove={(key, name) => setPendingRemoval({ key, name })}
                onToggleSelect={toggleSelect}
                onSelectAll={setSelectAll}
                onRemoveSelected={() => removeItems(selectedKeys)}
                onCheckout={startCheckout}
                onClear={() => setConfirmClearOpen(true)}
            />

            <MarketplaceCheckoutDialog
                isOpen={checkoutOpen}
                client={signedInClient}
                pricing={pricing}
                promoCode={promoCode}
                submitting={submitting}
                checkoutError={checkoutError}
                onApplyPromo={applyPromo}
                onClose={() => {
                    setCheckoutError(null)
                    setCheckoutOpen(false)
                }}
                onSubmit={(shipping, payment) =>
                    setPendingCheckout({ shipping, payment })
                }
                onOpenAccount={openAccount}
            />

            <ConfirmDialog
                isOpen={pendingCheckout !== null}
                type="warning"
                title="Place this order?"
                confirmText="Place order"
                cancelText="Review again"
                confirmButtonProps={{ customColorClass: PRIMARY_BUTTON }}
                onClose={() => setPendingCheckout(null)}
                onRequestClose={() => setPendingCheckout(null)}
                onCancel={() => setPendingCheckout(null)}
                onConfirm={() => {
                    if (pendingCheckout) {
                        void placeOrder(
                            pendingCheckout.shipping,
                            pendingCheckout.payment,
                        )
                    }
                }}
            >
                {pendingCheckout && pricing ? (
                    <div className="flex flex-col gap-1 text-sm">
                        <p>
                            {itemCount} item{itemCount === 1 ? '' : 's'} from{' '}
                            {pricing.divisions.length} store
                            {pricing.divisions.length === 1 ? '' : 's'}
                            {pendingCheckout.shipping.addressLine1 ||
                            pendingCheckout.shipping.city ? (
                                <>
                                    {' '}
                                    for delivery to{' '}
                                    <span className="font-semibold">
                                        {pendingCheckout.shipping.addressLine1}
                                        {pendingCheckout.shipping.addressLine1 &&
                                        pendingCheckout.shipping.city
                                            ? ', '
                                            : ''}
                                        {pendingCheckout.shipping.city}
                                    </span>
                                </>
                            ) : null}
                            .
                        </p>
                        <p>
                            Total due on delivery:{' '}
                            <span className="font-semibold text-gray-900">
                                {formatPrice(pricing.grandTotal)}
                            </span>
                        </p>
                    </div>
                ) : null}
            </ConfirmDialog>

            <Dialog
                isOpen={placedOrder !== null}
                width={440}
                onClose={() => setPlacedOrder(null)}
                onRequestClose={() => setPlacedOrder(null)}
            >
                {placedOrder ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <HiOutlineCheckCircle
                            className="text-5xl text-gray-900"
                            aria-hidden
                        />
                        <h4 className="text-xl font-semibold tracking-tight text-gray-900">
                            Order placed
                        </h4>
                        <p className="text-sm text-gray-500">
                            Order{' '}
                            <span className="font-mono font-medium text-gray-900">
                                {placedOrder.salesOrderId}
                            </span>{' '}
                            is pending delivery.
                        </p>
                        <ul className="flex w-full flex-col gap-2 text-sm">
                            {placedOrder.divisions.map((division) => (
                                <li
                                    key={division.divisionId}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                                >
                                    <span className="flex items-center gap-2">
                                        <SellerTag
                                            divisionId={division.divisionId}
                                            short
                                        />
                                        <span className="text-gray-500">
                                            {division.lines.length}{' '}
                                            {division.lines.length === 1
                                                ? 'item'
                                                : 'items'}
                                        </span>
                                    </span>
                                    <span className="font-semibold">
                                        {formatPrice(division.grandTotal)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm">
                            Total due on delivery:{' '}
                            <span className="font-semibold text-gray-900">
                                {formatPrice(placedOrder.grandTotal)}
                            </span>
                        </p>
                        <Button
                            block
                            className={PRIMARY_BUTTON_CLASS}
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => setPlacedOrder(null)}
                        >
                            Continue shopping
                        </Button>
                        <Button
                            block
                            variant="plain"
                            onClick={() => {
                                setPlacedOrder(null)
                                router.push(MARKETPLACE_ORDERS_PATH)
                            }}
                        >
                            View my orders
                        </Button>
                    </div>
                ) : null}
            </Dialog>

            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                type="danger"
                title="Remove item?"
                confirmText="Remove"
                cancelText="Keep"
                confirmButtonProps={{ customColorClass: DANGER_BUTTON }}
                onClose={() => setPendingRemoval(null)}
                onRequestClose={() => setPendingRemoval(null)}
                onCancel={() => setPendingRemoval(null)}
                onConfirm={() => {
                    if (pendingRemoval) removeItem(pendingRemoval.key)
                    setPendingRemoval(null)
                }}
            >
                <p>Remove {pendingRemoval?.name} from your cart?</p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmClearOpen}
                type="danger"
                title="Clear cart?"
                confirmText="Clear cart"
                cancelText="Cancel"
                confirmButtonProps={{ customColorClass: DANGER_BUTTON }}
                onClose={() => setConfirmClearOpen(false)}
                onRequestClose={() => setConfirmClearOpen(false)}
                onCancel={() => setConfirmClearOpen(false)}
                onConfirm={() => {
                    clearCart()
                    setPromoCode(null)
                    setConfirmClearOpen(false)
                }}
            >
                <p>All items will be removed from your cart.</p>
            </ConfirmDialog>

        </MarketplaceContext.Provider>
    )
}

export default MarketplaceProvider
