'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useResponsive from '@/utils/hooks/useResponsive'
import { LPG_DIVISION_ID, isLpgAddon } from '@/modules/sd/catalogs/lpgCatalog'
import { useMarketplaceProducts } from '@/modules/sd/hooks/useMarketplaceProducts'
import {
    calculateCartPricing,
    type CartPricing,
} from '@/modules/sd/services/ecommerceService'
import type { SalesDivisionId } from '@/modules/sd/services/pricingEngine'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import type { RetailClientProfile } from '@/services/storefront/retailClientService'
import StorefrontAccountDialog from '@/modules/storefront/shared/components/StorefrontAccountDialog'
import StorefrontOrdersDrawer from '@/modules/storefront/shared/components/StorefrontOrdersDrawer'
import MarketplaceCartDrawer from './components/MarketplaceCartDrawer'
import MarketplaceProductCard from './components/MarketplaceProductCard'
import { CHECKOUT_PATH, productHref } from './host'
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
    const selectedKeys = useMarketplaceCartStore((s) => s.selectedKeys)
    const toggleSelect = useMarketplaceCartStore((s) => s.toggleSelect)
    const setSelectAll = useMarketplaceCartStore((s) => s.setSelectAll)
    const removeItems = useMarketplaceCartStore((s) => s.removeItems)

    const client = useMarketplaceClientStore((s) => s.client)
    const openLogin = useMarketplaceClientStore((s) => s.openLogin)
    const isLoginOpen = useMarketplaceClientStore((s) => s.isLoginOpen)

    const favoriteKeys = useMarketplaceFavoritesStore((s) => s.keys)
    const toggleFavorite = useMarketplaceFavoritesStore((s) => s.toggle)

    const [hydrated, setHydrated] = useState(false)
    const [promoCode, setPromoCode] = useState<string | null>(null)
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

    useEffect(() => setHydrated(true), [])
    const signedInClient = hydrated ? client : null

    useEffect(() => {
        if (catalog.ready) syncCatalog(catalog.records)
    }, [catalog.ready, catalog.records, syncCatalog])

    useEffect(() => {
        if (!afterSignIn) return
        if (signedInClient) {
            // Checkout is a full page now; send the signed-in shopper there.
            if (afterSignIn === 'checkout') router.push(CHECKOUT_PATH)
            else if (afterSignIn === 'add') setConfirmingAdd(true)
            else setOrdersOpen(true)
            setAfterSignIn(null)
        } else if (!isLoginOpen) {
            if (afterSignIn === 'add') setRequestedAdd(null)
            setAfterSignIn(null)
        }
    }, [afterSignIn, signedInClient, isLoginOpen, router])

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
        if (signedInClient) {
            router.push(CHECKOUT_PATH)
            return
        }
        // Signed-out: sign in first; the effect routes to the checkout page.
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
        cancelAdd()
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
            router.push(`${CHECKOUT_PATH}?${params.toString()}`)
            return
        }
        addItem(product, quantity)
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
                        <SellerTag
                            divisionId={requestedAdd.product.divisionId}
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
