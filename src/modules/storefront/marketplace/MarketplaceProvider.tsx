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
import { useRouter } from 'next/navigation'
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
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { newIdempotencyKey } from '@/modules/sd/services/salesOrderDashboardService'
import type { RetailClientProfile } from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import StorefrontAccountDialog from '@/modules/storefront/shared/components/StorefrontAccountDialog'
import StorefrontOrdersDrawer from '@/modules/storefront/shared/components/StorefrontOrdersDrawer'
import MarketplaceCartDrawer from './components/MarketplaceCartDrawer'
import MarketplaceCheckoutDialog from './components/MarketplaceCheckoutDialog'
import MarketplaceProductCard from './components/MarketplaceProductCard'
import { productHref } from './host'
import {
    MARKETPLACE_NAME,
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
    itemCount: number
    quantityByKey: Map<string, number>
    favorites: Set<string>
    toggleFavorite: (key: string) => void
    /** Every add-to-cart: sign in first, then confirm before the cart changes. */
    requestAdd: (
        product: SdProductRecord,
        quantity?: number,
        buyNow?: boolean,
    ) => void
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
    const catalog = useMarketplaceProducts()

    const items = useMarketplaceCartStore((s) => s.items)
    const isCartOpen = useMarketplaceCartStore((s) => s.isDrawerOpen)
    const openCart = useMarketplaceCartStore((s) => s.openDrawer)
    const closeCart = useMarketplaceCartStore((s) => s.closeDrawer)
    const addItem = useMarketplaceCartStore((s) => s.addItem)
    const updateQuantity = useMarketplaceCartStore((s) => s.updateQuantity)
    const removeItem = useMarketplaceCartStore((s) => s.removeItem)
    const clearCart = useMarketplaceCartStore((s) => s.clearCart)
    const syncCatalog = useMarketplaceCartStore((s) => s.syncCatalog)

    const client = useMarketplaceClientStore((s) => s.client)
    const openLogin = useMarketplaceClientStore((s) => s.openLogin)
    const isLoginOpen = useMarketplaceClientStore((s) => s.isLoginOpen)

    const favoriteKeys = useMarketplaceFavoritesStore((s) => s.keys)
    const toggleFavorite = useMarketplaceFavoritesStore((s) => s.toggle)

    const [hydrated, setHydrated] = useState(false)
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [promoCode, setPromoCode] = useState<string | null>(null)
    const [pendingShipping, setPendingShipping] =
        useState<SalesOrderShippingDetails | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [placedOrder, setPlacedOrder] = useState<EcommerceOrderResult | null>(
        null,
    )
    const [pendingRemoval, setPendingRemoval] = useState<{
        key: string
        name: string
    } | null>(null)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)
    const [ordersOpen, setOrdersOpen] = useState(false)
    const [afterSignIn, setAfterSignIn] = useState<
        'checkout' | 'orders' | 'add' | null
    >(null)
    /** Add-to-cart awaiting sign-in (`afterSignIn === 'add'`) or confirmation. */
    const [requestedAdd, setRequestedAdd] = useState<PendingAdd | null>(null)
    const [confirmingAdd, setConfirmingAdd] = useState(false)
    const checkoutIdRef = useRef<string | null>(null)

    useEffect(() => setHydrated(true), [])
    const signedInClient = hydrated ? client : null

    useEffect(() => {
        if (catalog.ready) syncCatalog(catalog.records)
    }, [catalog.ready, catalog.records, syncCatalog])

    useEffect(() => {
        if (!afterSignIn) return
        if (signedInClient) {
            if (afterSignIn === 'checkout') setCheckoutOpen(true)
            else if (afterSignIn === 'add') setConfirmingAdd(true)
            else setOrdersOpen(true)
            setAfterSignIn(null)
        } else if (!isLoginOpen) {
            if (afterSignIn === 'add') setRequestedAdd(null)
            setAfterSignIn(null)
        }
    }, [afterSignIn, signedInClient, isLoginOpen])

    useEffect(() => {
        if (!signedInClient) setOrdersOpen(false)
    }, [signedInClient])

    const quantityByKey = useMemo(
        () =>
            new Map(
                items.map((item) => [productKey(item.product), item.quantity]),
            ),
        [items],
    )
    const productsByKey = useMemo(
        () =>
            new Map(
                items.map((item) => [productKey(item.product), item.product]),
            ),
        [items],
    )
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

    const pricingItems = useMemo(
        () =>
            items.map((item) => ({
                divisionId: item.product.divisionId as SalesDivisionId,
                sku: item.product.sku,
                quantity: item.quantity,
            })),
        [items],
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
        const lpgItems = items.filter(
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
            setCheckoutOpen(true)
            return
        }
        setAfterSignIn('checkout')
        openLogin()
    }

    const openOrders = useCallback(() => {
        if (signedInClient) {
            setOrdersOpen(true)
            return
        }
        setAfterSignIn('orders')
        openLogin()
    }, [signedInClient, openLogin])

    const placeOrder = async (shipping: SalesOrderShippingDetails) => {
        setPendingShipping(null)
        if (!signedInClient) {
            setCheckoutOpen(false)
            setAfterSignIn('checkout')
            openLogin()
            return
        }
        setSubmitting(true)
        try {
            const result = await processEcommerceOrder({
                checkoutId: checkoutIdRef.current ?? undefined,
                customerId: signedInClient.customerId,
                items: pricingItems,
                shipping,
                discountCode: promoCode ?? undefined,
            })
            checkoutIdRef.current = null
            clearCart()
            setPromoCode(null)
            setCheckoutOpen(false)
            closeCart()
            setPlacedOrder(result)
        } catch (error) {
            notify(
                'danger',
                'Order not placed',
                error instanceof Error ? error.message : 'Please try again.',
            )
        } finally {
            setSubmitting(false)
        }
    }

    const requestAdd = useCallback(
        (product: SdProductRecord, quantity = 1, buyNow = false) => {
            setRequestedAdd({ product, quantity, buyNow })
            if (signedInClient) {
                setConfirmingAdd(true)
                return
            }
            setAfterSignIn('add')
            openLogin()
        },
        [signedInClient, openLogin],
    )

    const cancelAdd = () => {
        setConfirmingAdd(false)
        setRequestedAdd(null)
    }

    const confirmAdd = () => {
        if (!requestedAdd || !signedInClient) return cancelAdd()
        const { product, quantity, buyNow } = requestedAdd
        addItem(product, quantity)
        cancelAdd()
        if (buyNow) {
            openCart()
            return
        }
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const increaseItem = useCallback(
        (product: SdProductRecord, quantity: number) => {
            if (signedInClient) {
                updateQuantity(productKey(product), quantity + 1)
            } else {
                requestAdd(product)
            }
        },
        [signedInClient, updateQuantity, requestAdd],
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
        itemCount,
        quantityByKey,
        favorites,
        toggleFavorite,
        requestAdd,
        openCart,
        openOrders,
        openAccount: openLogin,
        openProduct,
        renderCard,
    }

    return (
        <MarketplaceContext.Provider value={value}>
            {children}

            <ConfirmDialog
                isOpen={confirmingAdd && requestedAdd !== null}
                type="info"
                title={requestedAdd?.buyNow ? 'Buy this now?' : 'Add to cart?'}
                confirmText={
                    requestedAdd?.buyNow ? 'Add & view cart' : 'Add to cart'
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
                        <SellerTag
                            product={requestedAdd.product}
                        />
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
                pricing={pricing}
                productsByKey={productsByKey}
                signedIn={Boolean(signedInClient)}
                onClose={closeCart}
                onIncrease={updateQuantity}
                onDecrease={decreaseItem}
                onRemove={(key, name) => setPendingRemoval({ key, name })}
                onCheckout={startCheckout}
                onClear={() => setConfirmClearOpen(true)}
            />

            <MarketplaceCheckoutDialog
                isOpen={checkoutOpen}
                client={signedInClient}
                pricing={pricing}
                promoCode={promoCode}
                submitting={submitting}
                onApplyPromo={applyPromo}
                onClose={() => setCheckoutOpen(false)}
                onSubmit={setPendingShipping}
            />

            <ConfirmDialog
                isOpen={pendingShipping !== null}
                type="warning"
                title="Place this order?"
                confirmText="Place order"
                cancelText="Review again"
                confirmButtonProps={{ customColorClass: PRIMARY_BUTTON }}
                onClose={() => setPendingShipping(null)}
                onRequestClose={() => setPendingShipping(null)}
                onCancel={() => setPendingShipping(null)}
                onConfirm={() => {
                    if (pendingShipping) void placeOrder(pendingShipping)
                }}
            >
                {pendingShipping && pricing ? (
                    <div className="flex flex-col gap-1 text-sm">
                        <p>
                            {itemCount} item{itemCount === 1 ? '' : 's'} from{' '}
                            {pricing.divisions.length} store
                            {pricing.divisions.length === 1 ? '' : 's'} for
                            delivery to{' '}
                            <span className="font-semibold">
                                {pendingShipping.addressLine1},{' '}
                                {pendingShipping.city}
                            </span>
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
                                setOrdersOpen(true)
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

            <StorefrontOrdersDrawer
                isOpen={ordersOpen}
                customerId={signedInClient?.customerId ?? null}
                isMobile={isMobile}
                accentTextClass="text-emerald-700"
                renderOrderTag={(order) => (
                    <span className="flex flex-wrap gap-1">
                        {order.divisionIds.map((divisionId) => (
                            <SellerTag key={divisionId} divisionId={divisionId} />
                        ))}
                    </span>
                )}
                onClose={() => setOrdersOpen(false)}
            />

            <StorefrontAccountDialog
                useClientStore={useMarketplaceClientStore}
                storeName={MARKETPLACE_NAME}
                accentButtonClass={PRIMARY_BUTTON}
                accentIconClass="bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/30"
                accentTabClass="hover:!text-emerald-700 aria-selected:!border-emerald-600 aria-selected:!text-emerald-700"
                accentHeaderClass="!border-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60"
                accentInputClass="focus:!border-emerald-500 focus:!ring-emerald-500"
                formId="marketplace-account-form"
            />
        </MarketplaceContext.Provider>
    )
}

export default MarketplaceProvider
