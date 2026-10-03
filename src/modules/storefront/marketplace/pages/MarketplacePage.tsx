'use client'

import {
    Fragment,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import {
    HiOutlineAdjustments,
    HiOutlineArrowLeft,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineSearch,
    HiOutlineShoppingBag,
    HiOutlineShoppingCart,
    HiOutlineUserCircle,
    HiX,
} from 'react-icons/hi'
import { ShoppingBag } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Select from '@/components/ui/Select'
import toast from '@/components/ui/toast'
import classNames from '@/utils/classNames'
import useResponsive from '@/utils/hooks/useResponsive'
import { PRODUCT_DIVISIONS } from '@/modules/sd/catalogs/productDivisions'
import { LPG_DIVISION_ID, isLpgAddon } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
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
import {
    RETAIL_DIVISION_ID,
    type SalesOrderShippingDetails,
} from '@/types/storefront/retail'
import StorefrontAccountDialog from '@/modules/storefront/shared/components/StorefrontAccountDialog'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import StorefrontOrdersDrawer from '@/modules/storefront/shared/components/StorefrontOrdersDrawer'
import MarketplaceCartDrawer from '../components/MarketplaceCartDrawer'
import MarketplaceCategoryGrid, {
    marketplaceCategories,
    type MarketplaceCategory,
} from '../components/MarketplaceCategoryGrid'
import MarketplaceOfficialStores from '../components/MarketplaceOfficialStores'
import MarketplaceCheckoutDialog from '../components/MarketplaceCheckoutDialog'
import MarketplaceFilters, {
    type FilterOption,
} from '../components/MarketplaceFilters'
import MarketplaceProductCard, {
    discountPercent,
} from '../components/MarketplaceProductCard'
import MarketplaceProductDialog from '../components/MarketplaceProductDialog'
import MarketplaceProductRow from '../components/MarketplaceProductRow'
import MarketplaceStorePromoCard, {
    type StorePromo,
} from '../components/MarketplaceStorePromoCard'
import {
    MARKETPLACE_NAME,
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    SECTION_SUBTITLE,
    SECTION_TITLE,
    SURFACE,
    SellerTag,
    formatPrice,
    productKey,
} from '../marketplaceUi'
import {
    buildSearchIndex,
    normalizeSearchText,
    searchProducts,
} from '../marketplaceSearch'
import { useMarketplaceCartStore } from '../store/useMarketplaceCartStore'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'
import { useMarketplaceFavoritesStore } from '../store/useMarketplaceFavoritesStore'

type SortKey = 'recommended' | 'discount' | 'price-asc' | 'price-desc'
type SortOption = { value: SortKey; label: string }

const SORT_OPTIONS: SortOption[] = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'discount', label: 'Biggest discount' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
]

const SHELF_SIZE = 12

const PROMO_PHOTOS = '/images/marketplace'

const lowestPrice = (products: SdProductRecord[]) =>
    products.length ? Math.min(...products.map((p) => p.price)) : null

const biggestDiscount = (products: SdProductRecord[]) =>
    Math.max(0, ...products.map((p) => discountPercent(p) ?? 0))

/** Featured-store card copy; offers are read from the live catalogue, never invented. */
const buildStorePromos = (records: SdProductRecord[]): StorePromo[] => {
    const refillFrom = lowestPrice(
        records.filter(
            (p) => p.divisionId === LPG_DIVISION_ID && !isLpgAddon(p),
        ),
    )
    const applianceDiscount = biggestDiscount(
        records.filter((p) => p.divisionId === APPLIANCES_DIVISION_ID),
    )
    return [
        {
            divisionId: RETAIL_DIVISION_ID,
            storeName: 'AWIC',
            eyebrow: 'AWIC Official Store',
            headline: '10% off',
            body: (
                <>
                    Health &amp; wellness picks. Use code{' '}
                    <span className="rounded-md border border-dashed border-white/60 bg-white/15 px-1.5 py-0.5 font-mono font-semibold text-white">
                        AWIC10
                    </span>{' '}
                    at checkout.
                </>
            ),
            cta: 'Shop AWIC',
            photos: [1, 2, 3].map(
                (n) => `${PROMO_PHOTOS}/awic-family-cooking-${n}.jpg`,
            ),
            shadeClass: 'from-emerald-950/90 via-emerald-900/55',
            eyebrowClass: 'text-amber-200',
            buttonClass:
                'bg-white text-emerald-700 hover:bg-amber-50 transition-colors',
        },
        {
            divisionId: LPG_DIVISION_ID,
            storeName: 'LPG',
            eyebrow: 'LPG Official Store',
            headline:
                refillFrom !== null
                    ? `LPG from ${formatPrice(refillFrom)}`
                    : 'LPG to your door',
            body: 'Gas refills, brand-new tanks and stove add-ons, delivered to your home. Pay cash on delivery.',
            cta: 'Shop LPG',
            photos: [
                `${PROMO_PHOTOS}/lpg-family-cooking-1.jpg`,
                `${PROMO_PHOTOS}/lpg-delivery-2.jpg`,
            ],
            shadeClass: 'from-orange-950/90 via-orange-900/50',
            eyebrowClass: 'text-orange-200',
            buttonClass:
                'bg-white text-orange-600 hover:bg-orange-50 transition-colors',
        },
        {
            divisionId: APPLIANCES_DIVISION_ID,
            storeName: 'MCONPINCO',
            eyebrow: 'MCONPINCO Official Store',
            headline:
                applianceDiscount > 0
                    ? `Up to ${applianceDiscount}% off`
                    : 'Home appliances',
            body: 'Refrigerators, washing machines and kitchen essentials for every Filipino home.',
            cta: 'Shop MCONPINCO',
            photos: [
                `${PROMO_PHOTOS}/mconpinco-family-fridge-1.jpg`,
                `${PROMO_PHOTOS}/mconpinco-laundry-2.jpg`,
            ],
            shadeClass: 'from-red-950/90 via-red-900/50',
            eyebrowClass: 'text-red-200',
            buttonClass:
                'bg-white text-red-600 hover:bg-red-50 transition-colors',
        },
    ]
}

const byDiscount = (products: SdProductRecord[]) =>
    [...products].sort(
        (a, b) => (discountPercent(b) ?? 0) - (discountPercent(a) ?? 0),
    )

const DANGER_BUTTON = () => 'bg-red-500 hover:bg-red-600 text-white'

type PendingAdd = {
    product: SdProductRecord
    quantity: number
    /** "Buy now": open the cart after adding. */
    buyNow: boolean
}

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const MarketplacePage = () => {
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
    const [searchInput, setSearchInput] = useState('')
    const [selectedStores, setSelectedStores] = useState<string[]>([])
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [sort, setSort] = useState<SortKey>('recommended')
    const [filtersOpen, setFiltersOpen] = useState(false)
    /** Full catalogue grid instead of the homepage shelves. */
    const [showAll, setShowAll] = useState(false)
    const [selectedProduct, setSelectedProduct] =
        useState<SdProductRecord | null>(null)
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
    const productsRef = useRef<HTMLDivElement>(null)

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

    const deferredSearch = useDeferredValue(searchInput)
    const query = normalizeSearchText(deferredSearch)
    const searchIndex = useMemo(
        () => buildSearchIndex(catalog.records),
        [catalog.records],
    )
    const searchScores = useMemo(
        () => (query ? searchProducts(searchIndex, query) : null),
        [searchIndex, query],
    )
    const matchesSearch = useCallback(
        (product: SdProductRecord) =>
            !searchScores || searchScores.has(productKey(product)),
        [searchScores],
    )

    const storeOptions = useMemo<FilterOption[]>(
        () =>
            PRODUCT_DIVISIONS.map((division) => ({
                value: division.id,
                label: division.label,
                count: catalog.records.filter(
                    (p) => p.divisionId === division.id && matchesSearch(p),
                ).length,
            })),
        [catalog.records, matchesSearch],
    )

    const categoryOptions = useMemo<FilterOption[]>(() => {
        const counts = new Map<string, number>()
        for (const product of catalog.records) {
            if (
                selectedStores.length > 0 &&
                !selectedStores.includes(product.divisionId)
            )
                continue
            if (!matchesSearch(product)) continue
            counts.set(
                product.category,
                (counts.get(product.category) ?? 0) + 1,
            )
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, count]) => ({
                value: category,
                label: category,
                count,
            }))
    }, [catalog.records, selectedStores, matchesSearch])

    const storeCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const product of catalog.records) {
            counts.set(
                product.divisionId,
                (counts.get(product.divisionId) ?? 0) + 1,
            )
        }
        return counts
    }, [catalog.records])

    const activeCategories = selectedCategories.filter((category) =>
        categoryOptions.some((option) => option.value === category),
    )

    const visibleProducts = useMemo(() => {
        const filtered = catalog.records.filter(
            (product) =>
                (selectedStores.length === 0 ||
                    selectedStores.includes(product.divisionId)) &&
                (activeCategories.length === 0 ||
                    activeCategories.includes(product.category)) &&
                matchesSearch(product),
        )
        if (sort === 'price-asc')
            return [...filtered].sort((a, b) => a.price - b.price)
        if (sort === 'price-desc')
            return [...filtered].sort((a, b) => b.price - a.price)
        if (sort === 'discount') return byDiscount(filtered)
        if (searchScores) {
            const score = (product: SdProductRecord) =>
                searchScores.get(productKey(product)) ?? 0
            return [...filtered].sort((a, b) => score(b) - score(a))
        }
        return filtered
    }, [
        catalog.records,
        selectedStores,
        activeCategories,
        matchesSearch,
        searchScores,
        sort,
    ])

    const searching = query !== ''
    const browsing =
        showAll ||
        searching ||
        selectedStores.length > 0 ||
        activeCategories.length > 0

    const shelves = useMemo(() => {
        const ofDivision = (divisionId: string) =>
            catalog.records
                .filter((product) => product.divisionId === divisionId)
                .slice(0, SHELF_SIZE)
        const deals = byDiscount(
            catalog.records.filter((product) => discountPercent(product)),
        ).slice(0, SHELF_SIZE)
        return { deals, ofDivision }
    }, [catalog.records])

    const storePromos = useMemo(
        () => buildStorePromos(catalog.records),
        [catalog.records],
    )

    const shopCategories = useMemo(
        () => marketplaceCategories(catalog.records),
        [catalog.records],
    )

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

    const decreaseItem = (key: string, name: string, quantity: number) => {
        if (quantity <= 1) setPendingRemoval({ key, name })
        else updateQuantity(key, quantity - 1)
    }

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

    const openOrders = () => {
        if (signedInClient) {
            setOrdersOpen(true)
            return
        }
        setAfterSignIn('orders')
        openLogin()
    }

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

    /** Every add-to-cart: sign in first, then confirm before the cart changes. */
    const requestAdd = (
        product: SdProductRecord,
        quantity = 1,
        buyNow = false,
    ) => {
        setRequestedAdd({ product, quantity, buyNow })
        if (signedInClient) {
            setConfirmingAdd(true)
            return
        }
        setAfterSignIn('add')
        openLogin()
    }

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
            setSelectedProduct(null)
            openCart()
            return
        }
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const increaseItem = (product: SdProductRecord, quantity: number) => {
        if (signedInClient) updateQuantity(productKey(product), quantity + 1)
        else requestAdd(product)
    }

    const resetFilters = () => {
        setSelectedStores([])
        setSelectedCategories([])
    }

    const backToHome = () => {
        resetFilters()
        setSearchInput('')
        setSort('recommended')
        setShowAll(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const viewAllDeals = () => {
        setSort('discount')
        setShowAll(true)
        showProducts()
    }

    const showProducts = () =>
        productsRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        })

    const selectStore = (divisionId: string) => {
        const isOnlyStore =
            selectedStores.length === 1 && selectedStores[0] === divisionId
        setSelectedStores(isOnlyStore ? [] : [divisionId])
        if (!isOnlyStore) showProducts()
    }

    const selectCategory = (category: MarketplaceCategory) => {
        const isOnlyCategory =
            activeCategories.length === 1 &&
            activeCategories[0] === category.name
        if (isOnlyCategory) {
            setSelectedCategories([])
            return
        }
        setSelectedCategories([category.name])
        if (
            category.divisionId &&
            selectedStores.length > 0 &&
            !selectedStores.includes(category.divisionId)
        ) {
            setSelectedStores([])
        }
        showProducts()
    }

    const filters = (
        <MarketplaceFilters
            stores={storeOptions}
            categories={categoryOptions}
            selectedStores={selectedStores}
            selectedCategories={activeCategories}
            onStoresChange={setSelectedStores}
            onCategoriesChange={setSelectedCategories}
            onReset={resetFilters}
        />
    )

    const favorites = new Set(hydrated ? favoriteKeys : [])

    const renderCard = (product: SdProductRecord) => {
        const key = productKey(product)
        const quantity = quantityByKey.get(key) ?? 0
        return (
            <MarketplaceProductCard
                product={product}
                quantity={quantity}
                favorite={favorites.has(key)}
                onOpen={() => setSelectedProduct(product)}
                onAdd={() => requestAdd(product)}
                onIncrease={() => increaseItem(product, quantity)}
                onDecrease={() => decreaseItem(key, product.name, quantity)}
                onToggleFavorite={() => toggleFavorite(key)}
            />
        )
    }

    const cartButton = (
        <Button
            size="sm"
            variant="plain"
            className="!text-gray-500 hover:!text-emerald-600"
            icon={<HiOutlineShoppingCart className="text-xl" />}
            aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            onClick={openCart}
        />
    )

    const filterCount = selectedStores.length + activeCategories.length

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
                <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
                    <button
                        type="button"
                        aria-label={`${MARKETPLACE_NAME} home`}
                        className="group flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                        onClick={backToHome}
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/30 transition-transform duration-200 group-hover:scale-105">
                            <HiOutlineShoppingBag
                                className="text-lg"
                                aria-hidden
                            />
                        </span>
                        <span className="hidden text-base font-semibold tracking-tight text-gray-900 transition-colors group-hover:text-emerald-700 md:inline">
                            {MARKETPLACE_NAME}
                        </span>
                    </button>
                    <div className="mx-auto min-w-0 max-w-2xl flex-1">
                        <Input
                            size="sm"
                            className="!rounded-full !border-gray-100 !bg-gray-50 focus:!border-emerald-500 focus:!bg-white focus:!ring-emerald-500"
                            prefix={
                                <HiOutlineSearch className="text-lg text-gray-400" />
                            }
                            suffix={
                                searchInput ? (
                                    <button
                                        type="button"
                                        aria-label="Clear search"
                                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                        onClick={() => setSearchInput('')}
                                    >
                                        <HiX />
                                    </button>
                                ) : null
                            }
                            type="search"
                            enterKeyHint="search"
                            placeholder="Search products, brands and stores"
                            aria-label="Search products"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    window.scrollTo({
                                        top: 0,
                                        behavior: 'smooth',
                                    })
                                } else if (e.key === 'Escape') {
                                    setSearchInput('')
                                }
                            }}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            size="sm"
                            variant="plain"
                            className="!text-gray-500 hover:!text-emerald-600"
                            icon={
                                <HiOutlineClipboardList className="text-xl" />
                            }
                            aria-label="My orders"
                            onClick={openOrders}
                        >
                            <span className="hidden text-sm font-medium lg:inline">
                                My Orders
                            </span>
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            className="!text-gray-500 hover:!text-emerald-600"
                            icon={<HiOutlineUserCircle className="text-xl" />}
                            aria-label={
                                signedInClient ? 'Your account' : 'Sign in'
                            }
                            onClick={openLogin}
                        >
                            <span className="hidden max-w-[8rem] truncate text-sm font-medium lg:inline">
                                {signedInClient
                                    ? signedInClient.fullName.split(' ')[0]
                                    : 'Sign in'}
                            </span>
                        </Button>
                        {itemCount > 0 ? (
                            <Badge
                                content={itemCount}
                                maxCount={99}
                                innerClass="!bg-rose-500"
                            >
                                {cartButton}
                            </Badge>
                        ) : (
                            cartButton
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
                <div
                    className={classNames(
                        'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5',
                        searching && 'hidden',
                    )}
                >
                    <section className="relative flex min-h-[18rem] overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50/60 p-8 shadow-sm sm:p-12 md:min-h-[26rem] lg:col-span-3">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl"
                        />
                        <ShoppingBag
                            aria-hidden
                            strokeWidth={1}
                            className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 text-emerald-100"
                        />
                        <div className="relative z-10 flex max-w-lg flex-col justify-center lg:w-2/3">
                            <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                                Three official stores · One cart
                            </span>
                            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-5xl md:text-4xl lg:text-5xl">
                                One Platform,{' '}
                                <span className="text-emerald-600">
                                    Everything You Need
                                </span>
                            </h1>
                            <p className="mt-4 text-sm leading-relaxed text-gray-500 sm:text-base">
                                Vitamins, bags, LPG refills and home appliances
                                from AWIC, LPG and MCONPINCO. Pay cash on
                                delivery.
                            </p>
                            <div className="mt-8">
                                <Button
                                    className={PRIMARY_BUTTON_CLASS}
                                    customColorClass={PRIMARY_BUTTON}
                                    onClick={() => {
                                        setShowAll(true)
                                        showProducts()
                                    }}
                                >
                                    Shop Now
                                </Button>
                            </div>
                        </div>
                    </section>

                    <MarketplaceStorePromoCard
                        promos={storePromos}
                        className="lg:col-span-2"
                        onShop={selectStore}
                    />
                </div>

                <div
                    className={classNames('space-y-16', !searching && 'pt-16')}
                >
                    <section
                        aria-labelledby="official-stores-heading"
                        className={classNames(searching && 'hidden')}
                    >
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <h2
                                    id="official-stores-heading"
                                    className={SECTION_TITLE}
                                >
                                    Explore Official Brand Stores
                                </h2>
                                <p className={SECTION_SUBTITLE}>
                                    Shop directly from AGC&apos;s verified
                                    divisions.
                                </p>
                            </div>
                            {selectedStores.length > 0 ? (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    className="text-sm font-medium !text-gray-500 hover:!text-emerald-600"
                                    onClick={() => setSelectedStores([])}
                                >
                                    All stores
                                </Button>
                            ) : null}
                        </div>
                        <MarketplaceOfficialStores
                            counts={storeCounts}
                            activeDivisionId={
                                selectedStores.length === 1
                                    ? selectedStores[0]
                                    : null
                            }
                            onSelect={selectStore}
                        />
                    </section>

                    <section
                        aria-labelledby="categories-heading"
                        className={classNames(searching && 'hidden')}
                    >
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <h2
                                    id="categories-heading"
                                    className={SECTION_TITLE}
                                >
                                    Explore Popular Categories
                                </h2>
                                <p className={SECTION_SUBTITLE}>
                                    Find what you need across every store.
                                </p>
                            </div>
                            {activeCategories.length > 0 ? (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    className="text-sm font-medium !text-gray-500 hover:!text-emerald-600"
                                    onClick={() => setSelectedCategories([])}
                                >
                                    All categories
                                </Button>
                            ) : null}
                        </div>
                        <MarketplaceCategoryGrid
                            activeCategory={
                                activeCategories.length === 1
                                    ? activeCategories[0]
                                    : null
                            }
                            categories={shopCategories}
                            onSelect={selectCategory}
                        />
                    </section>

                    <div ref={productsRef} className="scroll-mt-20">
                        {browsing ? (
                            <div className="flex gap-8">
                                <aside className="hidden w-64 shrink-0 lg:block">
                                    <Card
                                        className={classNames(
                                            'sticky top-24 rounded-xl',
                                            SURFACE,
                                        )}
                                    >
                                        {filters}
                                    </Card>
                                </aside>

                                <section className="min-w-0 flex-1">
                                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                        <span className="flex items-center gap-2 text-sm text-gray-500">
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                className="!px-1 font-medium !text-emerald-700"
                                                icon={<HiOutlineArrowLeft />}
                                                onClick={backToHome}
                                            >
                                                Home
                                            </Button>
                                            {!catalog.ready ? (
                                                'Loading products…'
                                            ) : searching ? (
                                                <span aria-live="polite">
                                                    {visibleProducts.length}{' '}
                                                    result
                                                    {visibleProducts.length ===
                                                    1
                                                        ? ''
                                                        : 's'}{' '}
                                                    for{' '}
                                                    <span className="font-semibold text-gray-900">
                                                        &ldquo;
                                                        {deferredSearch.trim()}
                                                        &rdquo;
                                                    </span>
                                                </span>
                                            ) : (
                                                `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'}`
                                            )}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                className="lg:hidden"
                                                icon={<HiOutlineAdjustments />}
                                                onClick={() =>
                                                    setFiltersOpen(true)
                                                }
                                            >
                                                Filters
                                                {filterCount > 0
                                                    ? ` (${filterCount})`
                                                    : ''}
                                            </Button>
                                            <div className="w-48">
                                                <Select<SortOption>
                                                    size="sm"
                                                    isSearchable={false}
                                                    options={SORT_OPTIONS}
                                                    value={SORT_OPTIONS.find(
                                                        (o) => o.value === sort,
                                                    )}
                                                    onChange={(option) =>
                                                        setSort(
                                                            option?.value ??
                                                                'recommended',
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                                        {visibleProducts.map((product) => (
                                            <Fragment key={productKey(product)}>
                                                {renderCard(product)}
                                            </Fragment>
                                        ))}
                                    </div>
                                    <StorefrontCatalogStatus
                                        loading={catalog.loading}
                                        error={catalog.error}
                                        empty={
                                            catalog.ready &&
                                            visibleProducts.length === 0
                                        }
                                        onRetry={catalog.reload}
                                    />
                                </section>
                            </div>
                        ) : (
                            <div className="space-y-16">
                                <MarketplaceProductRow
                                    id="deals-heading"
                                    title="Today's Best Deals"
                                    products={shelves.deals}
                                    onViewAll={viewAllDeals}
                                    renderCard={renderCard}
                                />
                                <MarketplaceProductRow
                                    id="appliances-heading"
                                    title="Bestsellers In Home Appliances"
                                    products={shelves.ofDivision(
                                        APPLIANCES_DIVISION_ID,
                                    )}
                                    onViewAll={() =>
                                        selectStore(APPLIANCES_DIVISION_ID)
                                    }
                                    renderCard={renderCard}
                                />
                                <MarketplaceProductRow
                                    id="wellness-heading"
                                    title="Health & Wellness"
                                    products={shelves.ofDivision(
                                        RETAIL_DIVISION_ID,
                                    )}
                                    onViewAll={() =>
                                        selectStore(RETAIL_DIVISION_ID)
                                    }
                                    renderCard={renderCard}
                                />
                                <MarketplaceProductRow
                                    id="energy-heading"
                                    title="Energy & Gas Essentials"
                                    products={shelves.ofDivision(
                                        LPG_DIVISION_ID,
                                    )}
                                    onViewAll={() =>
                                        selectStore(LPG_DIVISION_ID)
                                    }
                                    renderCard={renderCard}
                                />
                                <StorefrontCatalogStatus
                                    loading={catalog.loading}
                                    error={catalog.error}
                                    empty={
                                        catalog.ready &&
                                        catalog.records.length === 0
                                    }
                                    onRetry={catalog.reload}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <Drawer
                title="Filters"
                isOpen={filtersOpen}
                placement={isMobile ? 'bottom' : 'left'}
                width={300}
                height="75dvh"
                className={
                    isMobile ? '[&_.drawer-content]:rounded-t-2xl' : undefined
                }
                onClose={() => setFiltersOpen(false)}
                onRequestClose={() => setFiltersOpen(false)}
                footer={
                    <Button
                        block
                        className={PRIMARY_BUTTON_CLASS}
                        customColorClass={PRIMARY_BUTTON}
                        onClick={() => setFiltersOpen(false)}
                    >
                        Show {visibleProducts.length} product
                        {visibleProducts.length === 1 ? '' : 's'}
                    </Button>
                }
            >
                {filters}
            </Drawer>

            <MarketplaceProductDialog
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onAddToCart={(product, quantity) =>
                    requestAdd(product, quantity)
                }
                onBuyNow={(product, quantity) =>
                    requestAdd(product, quantity, true)
                }
            />

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
                            {placedOrder.orders.length === 1
                                ? 'Order placed'
                                : 'Orders placed'}
                        </h4>
                        <p className="text-sm text-gray-500">
                            {placedOrder.orders.length === 1
                                ? 'Your order is pending delivery.'
                                : 'Each store delivers its own order.'}
                        </p>
                        <ul className="flex w-full flex-col gap-2 text-sm">
                            {placedOrder.orders.map((order) => (
                                <li
                                    key={order.salesOrderId}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="font-mono font-medium text-gray-900">
                                            {order.salesOrderId}
                                        </span>
                                        <SellerTag
                                            divisionId={order.divisionId}
                                            short
                                        />
                                    </span>
                                    <span className="font-semibold">
                                        {formatPrice(order.grandTotal)}
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
                    <SellerTag divisionId={order.divisionId} />
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
        </div>
    )
}

export default MarketplacePage
